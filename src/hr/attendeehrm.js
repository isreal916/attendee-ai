import { createHash } from "node:crypto";

/**
 * AttendeeHRM adapter — reads live HR data from the existing AttendeeHRM API
 * on behalf of the signed-in employee, using the employee's own access token.
 *
 * Safety rules this file enforces:
 * - The employee is whoever the backend says the token belongs to. The token
 *   is checked against the backend before anything else happens.
 * - Every request carries only the token owner's own userid/pin. Nothing the
 *   model or the browser sends can change whose data is requested.
 * - Every response is checked to belong to that employee before it is used;
 *   a response about anyone else is discarded.
 * - Only self-service endpoints are called. The list endpoints that return
 *   company-wide rows (/getleaverequests, /getexemptions, …) are not used.
 * - The token is never logged or stored.
 */

const IDENTITY_TTL_MS = 5 * 60_000;
const pad = (n) => String(n).padStart(2, "0");
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function decodeClaims(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    // AttendeeHRM nests claims under `data`; some tokens carry them at the top level.
    const claims = payload.data && typeof payload.data === "object" ? payload.data : payload;
    return { claims, exp: payload.exp ?? claims.exp ?? null };
  } catch {
    return null;
  }
}

function monthRange(month) {
  const m = /^(\d{4})-(\d{2})$/.exec(month ?? "");
  const now = new Date();
  const year = m ? Number(m[1]) : now.getFullYear();
  const monthIndex = m ? Number(m[2]) - 1 : now.getMonth();
  return {
    year,
    month: monthIndex + 1,
    label: `${year}-${pad(monthIndex + 1)}`,
    start: `${year}-${pad(monthIndex + 1)}-01`,
    end: `${year}-${pad(monthIndex + 1)}-${pad(new Date(year, monthIndex + 1, 0).getDate())}`,
    today: dateKey(now),
  };
}

const same = (a, b) => a != null && a !== "" && b != null && b !== "" && String(a) === String(b);

const present = (v) => v != null && v !== "";

/**
 * True if the record names this employee; false if it names someone else;
 * null if there is nothing to compare (the record carries no identifier, or
 * only one the token does not have — e.g. a pin when the token has none).
 */
function belongsTo(record, identity) {
  const pin = record?.pin ?? record?.employee_pin;
  const userid = record?.userid ?? record?.user_id ?? record?.employee_id;
  const pairs = [
    [pin, identity.pin],
    [userid, identity.userId],
  ].filter(([a, b]) => present(a) && present(b));
  if (pairs.length === 0) return null;
  return pairs.some(([a, b]) => same(a, b));
}

/** The record inside a response, whether it is wrapped in data/result or a one-item list. */
function unwrapRecord(json) {
  const r = json?.data ?? json?.result ?? json;
  return Array.isArray(r) ? r[0] ?? {} : r ?? {};
}

function assertMine(record, identity, what) {
  if (belongsTo(record, identity) === false) {
    throw new Error(`the HR system returned ${what} for a different employee; discarded`);
  }
}

const num = (v) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

export function createAttendeeHrmAdapter({ apiUrl, fetchImpl = fetch, log = console }) {
  if (!apiUrl) throw new Error("ATTENDEE_API_URL is required when HR_ADAPTER=attendeehrm");
  const base = apiUrl.replace(/\/$/, "");
  const verified = new Map();

  async function post(path, body, token) {
    const res = await fetchImpl(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw Object.assign(new Error(`${path} returned HTTP ${res.status}`), { status: res.status });
    // The backend often reports failure as HTTP 200 with { status: "error" }.
    const status = String(json?.status ?? "").toLowerCase();
    if (["error", "fail", "failed", "false", "0"].includes(status)) {
      throw new Error(typeof json.message === "string" ? json.message : `${path} failed`);
    }
    return json;
  }

  return {
    name: "attendeehrm",

    /**
     * Bearer token → verified identity, or null. The claims are only trusted
     * after the backend accepts the token for that same employee.
     */
    async resolveIdentity(token) {
      const key = createHash("sha256").update(token).digest("hex");
      const cached = verified.get(key);
      if (cached && cached.until > Date.now()) return cached.identity;
      verified.delete(key);

      // Why a sign-in was refused, for the server log. Never includes the token or any value from it.
      const reject = (reason) => {
        log.warn(`sign-in rejected: ${reason}`);
        return null;
      };

      const decoded = decodeClaims(token);
      const claims = decoded?.claims;
      if (!claims) return reject("the token is not a readable JWT");
      if (claims.userid == null || claims.compid == null) {
        return reject(`the token has no userid/compid claim (claims present: ${Object.keys(claims).join(", ")})`);
      }
      if (decoded.exp && decoded.exp * 1000 < Date.now()) return reject("the token has expired");

      const identity = {
        companyId: String(claims.compid),
        companyName: String(claims.company_name ?? claims.compcode ?? "your company"),
        userId: String(claims.userid),
        pin: present(claims.pin) ? String(claims.pin) : "",
        name: "",
        token,
      };
      // The backend rejects any token it did not issue (HTTP 401), so a successful
      // answer here is what proves the token — and therefore its claims — is genuine.
      let record;
      try {
        record = unwrapRecord(await post("/getemployee", { userid: identity.userId }, token));
      } catch (err) {
        return reject(`the HR system did not accept the token (/getemployee: ${err.message})`);
      }
      if (belongsTo(record, identity) === false) {
        return reject("/getemployee answered with a different employee's record");
      }
      identity.name = String(record.name ?? claims.name ?? claims.email ?? "there");
      if (!identity.pin && present(record.pin)) identity.pin = String(record.pin);

      const until = Math.min(Date.now() + IDENTITY_TTL_MS, decoded.exp ? decoded.exp * 1000 : Infinity);
      verified.set(key, { identity, until });
      return identity;
    },

    async getProfile(identity) {
      const r = unwrapRecord(await post("/getemployee", { userid: identity.userId }, identity.token));
      assertMine(r, identity, "a profile");
      const started = r.empdate && !String(r.empdate).startsWith("1970-01-01") ? String(r.empdate).slice(0, 10) : null;
      return {
        name: r.name ?? identity.name,
        // The job title is the designation only. A grade is a pay or seniority band, not a title,
        // so it is reported separately; null tells the model the record has no title.
        job_title: r.designation || null,
        grade: r.grade || null,
        department: r.department ?? null,
        branch: r.location ?? null,
        employment_type: r.emptype ?? null,
        start_date: started,
        status: r.status ?? null,
      };
    },

    async getLeaveBalance(identity, { year } = {}) {
      const leaveYear = String(year ?? new Date().getFullYear());
      const json = await post(
        "/getleaveusages",
        { view: "Individual", leave_year: leaveYear, pin: identity.pin },
        identity.token,
      );
      const rows = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
      // Pick this employee's row explicitly — never "the first row".
      const mine = rows.find((row) => belongsTo(row, identity) === true);
      if (!mine) return { leave_year: Number(leaveYear), types: [], note: "No leave entitlement is set up for this year." };
      return {
        leave_year: Number(leaveYear),
        types: (mine.leave_rows ?? []).map((l) => ({
          type: l.leavetype,
          entitled_days: num(l.expected),
          used_days: num(l.used),
          remaining_days: num(l.remainder),
        })),
        total_entitled_days: num(mine.totals?.expected),
        total_used_days: num(mine.totals?.used),
        total_remaining_days: num(mine.totals?.remainder),
      };
    },

    async getAttendanceSummary(identity, { month } = {}) {
      const r = monthRange(month);
      const json = await post(
        "/getmyattendance",
        { userid: identity.userId, start_date: r.start, end_date: r.end, todate: r.today },
        identity.token,
      );
      const report = json?.report ?? json ?? {};
      if (report.employee) assertMine(report.employee, identity, "an attendance report");
      const s = report.summary ?? {};
      // Summary only: daily records carry clock-in locations and are not passed to the model.
      return {
        month: r.label,
        scheduled_days: num(s.scheduled_days),
        present_days: num(s.present_days),
        absent_days: num(s.absent_days),
        late_days: num(s.late_days),
        attendance_rate: num(s.attendance_rate),
        punctuality_rate: num(s.punctuality_rate),
        worked_hours: num(s.worked_hours),
        overtime_hours: num(s.overtime_hours),
      };
    },

    async getShifts(identity, { month } = {}) {
      const r = monthRange(month);
      const json = await post(
        "/getmyshifts",
        { userid: identity.userId, todate: r.today, start_date: r.start, end_date: r.end },
        identity.token,
      );
      const data = json?.data ?? json ?? {};
      assertMine(data, identity, "a shift roster");
      const day = (d) =>
        !d || (!d.display && !d.clockin)
          ? { date: String(d?.date ?? "").slice(0, 10), off: true }
          : { date: String(d.date ?? "").slice(0, 10), clock_in: d.clockin, clock_out: d.clockout, hours: num(d.hours) };
      // Month totals are counted here from the roster, so the model reports them instead of estimating.
      const monthDays = (Array.isArray(data.all_shifts) ? data.all_shifts : []).map(day);
      const worked = monthDays.filter((d) => !d.off);
      return {
        month: r.label,
        shift_name: data.shiftname ?? null,
        shifts_in_month: monthDays.length ? worked.length : null,
        days_off_in_month: monthDays.length ? monthDays.length - worked.length : null,
        hours_in_month: monthDays.length ? worked.reduce((n, d) => n + (d.hours ?? 0), 0) : null,
        today: data.today_shift ? day(data.today_shift) : null,
        shifts_this_week: num(data.shifts_this_week),
        hours_this_week: num(data.hours_this_week),
        upcoming: (Array.isArray(data.upcoming_shifts) ? data.upcoming_shifts : []).slice(0, 14).map(day),
      };
    },

    async getPaySummary(identity, { month } = {}) {
      const r = monthRange(month);
      const json = await post(
        "/mypayrolldashboard",
        { by: "ess", pin: identity.pin, month: String(r.month), year: String(r.year) },
        identity.token,
      );
      // An admin session gets the whole company's payroll from this endpoint. Refuse that shape.
      if (String(json?.caller?.type ?? "").toLowerCase() !== "ess") {
        throw new Error("pay summary is only available from an employee (ESS) session");
      }
      if (json.employee) assertMine(json.employee, identity, "a pay summary");
      const s = json.summary ?? {};
      return {
        month: r.label,
        gross_pay: num(s.gross_pay),
        total_deductions: num(s.total_deductions),
        net_pay: num(s.net_pay),
        payroll_status: typeof json.payroll_status === "string" ? json.payroll_status : null,
      };
    },
  };
}
