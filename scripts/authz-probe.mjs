#!/usr/bin/env node
/**
 * Authorization probe for the AttendeeHRM API.
 *
 * Question it answers: when employee A is signed in, can A read employee B's
 * data by putting B's pin/userid in the request body? Attendee AI calls the
 * API with the employee's own token, so it is only safe if the backend scopes
 * every call to the token, not to identifiers in the body.
 *
 * Run it yourself; credentials come from env vars and are never printed.
 * Only verdicts are printed (no names, amounts, dates or tokens).
 *
 *   ATTENDEE_API_URL=https://your-attendeehrm-host/api \
 *   ATTENDEE_COMPCODE=yourcompcode \
 *   A_LOGIN=a@example.com A_PASSWORD=... \
 *   B_LOGIN=b@example.com B_PASSWORD=... \
 *   node scripts/authz-probe.mjs
 *
 * A_LOGIN / B_LOGIN may be an email or a PIN. Use two ordinary employee
 * accounts (not admins) in the same company, without 2FA.
 */

const API = requireEnv("ATTENDEE_API_URL").replace(/\/$/, "");
const COMPCODE = requireEnv("ATTENDEE_COMPCODE");

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env var ${name}`);
    process.exit(1);
  }
  return v;
}

function decodeJwt(token) {
  const part = token.split(".")[1];
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

async function post(path, body, token) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON body */
  }
  return { http: res.status, json };
}

async function login(label, loginId, password) {
  const body = { compcode: COMPCODE, password };
  if (loginId.includes("@")) body.email = loginId;
  else body.pin = loginId;
  const { http, json } = await post("/login", body);
  const data = json?.data ?? json;
  if (data?.status === "2fa_required") {
    throw new Error(`${label}: account has 2FA on; use one without 2FA`);
  }
  if (!data?.access_token) {
    throw new Error(`${label}: login failed (HTTP ${http}, ${data?.message ?? "no message"})`);
  }
  const claims = decodeJwt(data.access_token);
  return {
    token: data.access_token,
    userid: String(claims.userid ?? claims.data?.userid ?? ""),
    pin: String(claims.pin ?? claims.data?.pin ?? ""),
    claimKeys: Object.keys(claims.data ?? claims),
  };
}

/** Every userid/pin value found anywhere in a response. */
function collectIds(node, out = { userids: new Set(), pins: new Set() }) {
  if (Array.isArray(node)) {
    for (const x of node) collectIds(x, out);
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (v != null && typeof v !== "object") {
        if (["userid", "user_id", "employee_id"].includes(k)) out.userids.add(String(v));
        if (["pin", "employee_pin"].includes(k)) out.pins.add(String(v));
      } else {
        collectIds(v, out);
      }
    }
  }
  return out;
}

function verdict(ids, a, b, json) {
  const status = String(json?.status ?? json?.data?.status ?? "").toLowerCase();
  const hasB = ids.userids.has(b.userid) || ids.pins.has(b.pin);
  const others = new Set(
    [...ids.pins].filter((p) => p !== a.pin && p !== b.pin),
  ).size;
  if (status === "error" || status === "fail") return { result: "REFUSED", hasB, others };
  if (hasB) return { result: "LEAKS B", hasB, others };
  if (others > 0) return { result: "LEAKS OTHERS", hasB, others };
  return { result: "OK (self or empty)", hasB, others };
}

function monthBounds() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const last = new Date(y, m, 0).getDate();
  return {
    from: `${y}-${pad(m)}-01`,
    to: `${y}-${pad(m)}-${pad(last)}`,
    today: `${y}-${pad(m)}-${pad(d.getDate())}`,
    month: String(m),
    year: String(y),
  };
}

async function main() {
  const a = await login("A", requireEnv("A_LOGIN"), requireEnv("A_PASSWORD"));
  const b = await login("B", requireEnv("B_LOGIN"), requireEnv("B_PASSWORD"));
  if (a.userid === b.userid) throw new Error("A and B are the same user");
  console.log(`JWT claim keys: ${a.claimKeys.join(", ")}\n`);

  const r = monthBounds();
  // Each case: A's token, B's identifiers in the body.
  const cases = [
    ["/getemployee", { userid: b.userid }],
    ["/getleaveusages", { view: "Individual", leave_year: r.year, pin: b.pin }],
    ["/getmyattendance", { userid: b.userid, start_date: r.from, end_date: r.to, todate: r.today }],
    ["/getmyshifts", { userid: b.userid, todate: r.today, start_date: r.from, end_date: r.to }],
    ["/mypayrolldashboard", { by: "ess", pin: b.pin, month: r.month, year: r.year }],
    // No identifiers at all: does the endpoint return everyone?
    ["/getleaverequests", {}],
    ["/getexemptions", {}],
    ["/gettrainings", {}],
  ];

  const rows = [];
  for (const [path, body] of cases) {
    try {
      const { http, json } = await post(path, body, a.token);
      const ids = collectIds(json);
      const v = verdict(ids, a, b, json);
      rows.push({ endpoint: path, http, result: v.result, "B's data": v.hasB, "other employees": v.others });
    } catch (err) {
      rows.push({ endpoint: path, http: "-", result: `ERROR ${err.message}` });
    }
  }
  console.table(rows);
  console.log(
    "\nLEAKS B      = A's token read B's record by sending B's id — backend trusts the body.\n" +
      "LEAKS OTHERS = response contains other employees' records.\n" +
      "OK           = only A's own data (or nothing) came back.",
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
