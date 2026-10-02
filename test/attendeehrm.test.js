import assert from "node:assert/strict";
import { test } from "node:test";
import { createAttendeeHrmAdapter } from "../src/hr/attendeehrm.js";

const jwt = (claims, exp = Math.floor(Date.now() / 1000) + 3600) =>
  `h.${Buffer.from(JSON.stringify({ exp, data: claims })).toString("base64url")}.s`;

const ADA = { userid: 41, pin: "1001", compid: 7, compcode: "lumen", email: "ada@example.com" };
const ADA_TOKEN = jwt(ADA);

/**
 * Fake AttendeeHRM backend. `routes` maps a path to a handler (body) → JSON.
 * Like the real one, it rejects tokens it did not issue.
 */
function backend(routes, { validTokens = [ADA_TOKEN] } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const path = new URL(url).pathname.replace(/^\/api/, "");
    const body = JSON.parse(init.body);
    const token = init.headers.Authorization.replace("Bearer ", "");
    calls.push({ path, body });
    if (!validTokens.includes(token)) return { ok: false, status: 401, json: async () => ({}) };
    const handler = routes[path];
    if (!handler) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => handler(body) };
  };
  const log = { warnings: [], warn: (m) => log.warnings.push(m) };
  return { calls, log, adapter: createAttendeeHrmAdapter({ apiUrl: "https://hrm.test/api", fetchImpl, log }) };
}

const adaRecord = {
  userid: 41, pin: "1001", name: "Ada Okafor", designation: "Frontend Developer",
  department: "Engineering", location: "Lagos HQ", empdate: "2026-09-18", emptype: "Full time",
};
const profileRoute = { "/getemployee": () => ({ status: "success", data: adaRecord }) };

test("identity comes from a token the backend accepts, for that same employee", async () => {
  const { adapter, calls } = backend(profileRoute);
  const identity = await adapter.resolveIdentity(ADA_TOKEN);
  assert.equal(identity.userId, "41");
  assert.equal(identity.companyId, "7");
  assert.equal(identity.name, "Ada Okafor");
  assert.deepEqual(calls[0], { path: "/getemployee", body: { userid: "41" } });

  // Verified identities are cached briefly — no second backend call.
  await adapter.resolveIdentity(ADA_TOKEN);
  assert.equal(calls.length, 1);
});

test("forged, expired and mismatched tokens are rejected", async () => {
  const { adapter } = backend(profileRoute);
  // Claims to be Ada, but the backend never issued it.
  assert.equal(await adapter.resolveIdentity(jwt({ ...ADA, note: "forged" })), null);
  assert.equal(await adapter.resolveIdentity("not-a-jwt"), null);

  const expired = jwt(ADA, Math.floor(Date.now() / 1000) - 60);
  assert.equal(await backend(profileRoute, { validTokens: [expired] }).adapter.resolveIdentity(expired), null);

  // Backend accepts the token but answers with a different employee's record.
  const other = backend({ "/getemployee": () => ({ data: { ...adaRecord, userid: 99, pin: "2002" } }) });
  assert.equal(await other.adapter.resolveIdentity(ADA_TOKEN), null);
});

test("every request carries only the token owner's own identifiers", async () => {
  const { adapter, calls } = backend({
    ...profileRoute,
    "/getleaveusages": () => ({ data: [] }),
    "/getmyattendance": () => ({ summary: {} }),
    "/getmyshifts": () => ({ data: { userid: 41 } }),
    "/mypayrolldashboard": () => ({ caller: { type: "ess" }, summary: {} }),
  });
  const identity = await adapter.resolveIdentity(ADA_TOKEN);
  await adapter.getLeaveBalance(identity, { year: 2026 });
  await adapter.getAttendanceSummary(identity, { month: "2026-09" });
  await adapter.getShifts(identity, { month: "2026-09" });
  await adapter.getPaySummary(identity, { month: "2026-09" });

  for (const { path, body } of calls) {
    if ("userid" in body) assert.equal(body.userid, "41", path);
    if ("pin" in body) assert.equal(body.pin, "1001", path);
  }
  assert.equal(calls.find((c) => c.path === "/mypayrolldashboard").body.by, "ess");
});

test("leave balance uses this employee's row, not the first row", async () => {
  const { adapter } = backend({
    ...profileRoute,
    "/getleaveusages": () => ({
      data: [
        { pin: "2002", leave_rows: [{ leavetype: "Annual", expected: 30, used: 1, remainder: 29 }], totals: { remainder: 29 } },
        { pin: "1001", leave_rows: [{ leavetype: "Annual", expected: 20, used: 11, remainder: 9 }], totals: { expected: 20, used: 11, remainder: 9 } },
      ],
    }),
  });
  const identity = await adapter.resolveIdentity(ADA_TOKEN);
  const balance = await adapter.getLeaveBalance(identity);
  assert.equal(balance.total_remaining_days, 9);
  assert.deepEqual(balance.types[0], { type: "Annual", entitled_days: 20, used_days: 11, remaining_days: 9 });
});

test("another employee's data is discarded, and company-wide payroll is refused", async () => {
  const { adapter } = backend({
    ...profileRoute,
    "/getmyshifts": () => ({ data: { userid: 99, shiftname: "Night" } }),
    "/getmyattendance": () => ({ employee: { pin: "2002" }, summary: { present_days: 20 } }),
    "/mypayrolldashboard": () => ({ caller: { type: "admin" }, summary: { net_pay: 99_000_000 } }),
  });
  const identity = await adapter.resolveIdentity(ADA_TOKEN);
  await assert.rejects(adapter.getShifts(identity), /different employee/);
  await assert.rejects(adapter.getAttendanceSummary(identity), /different employee/);
  await assert.rejects(adapter.getPaySummary(identity), /employee \(ESS\) session/);
});

test("attendance returns the summary only; HTTP-200 errors are treated as failures", async () => {
  const { adapter } = backend({
    ...profileRoute,
    "/getmyattendance": () => ({
      employee: { pin: "1001" },
      summary: { present_days: "18", late_days: 2, attendance_rate: 94.7 },
      daily_records: [{ date: "2026-09-01", latitude: 6.5, longitude: 3.3 }],
    }),
    "/getmyshifts": () => ({ status: "error", message: "No roster assigned" }),
  });
  const identity = await adapter.resolveIdentity(ADA_TOKEN);
  const summary = await adapter.getAttendanceSummary(identity, { month: "2026-09" });
  assert.equal(summary.present_days, 18);
  assert.equal(JSON.stringify(summary).includes("latitude"), false);
  await assert.rejects(adapter.getShifts(identity), /No roster assigned/);
});

test("a token without a pin still signs in, and the pin is taken from the HR record", async () => {
  const token = jwt({ userid: 41, compid: 7, compcode: "lumen" });
  const { adapter } = backend({ "/getemployee": () => ({ data: [{ pin: "1001", name: "Ada Okafor" }] }) }, { validTokens: [token] });
  const identity = await adapter.resolveIdentity(token);
  assert.equal(identity.name, "Ada Okafor");
  assert.equal(identity.pin, "1001");
});

test("a rejected sign-in logs its reason without the token", async () => {
  const { adapter, log } = backend(profileRoute);
  const forged = jwt({ ...ADA, note: "forged" });
  assert.equal(await adapter.resolveIdentity(forged), null);
  assert.match(log.warnings[0], /did not accept the token .*HTTP 401/);
  assert.equal(log.warnings[0].includes(forged), false);
});

test("the profile reports the designation as the job title, never the grade", async () => {
  const withTitle = backend(profileRoute);
  const a = await withTitle.adapter.getProfile(await withTitle.adapter.resolveIdentity(ADA_TOKEN));
  assert.equal(a.job_title, "Frontend Developer");

  const noTitle = backend({ "/getemployee": () => ({ data: { ...adaRecord, designation: "", grade: "Grade Two" } }) });
  const b = await noTitle.adapter.getProfile(await noTitle.adapter.resolveIdentity(ADA_TOKEN));
  assert.equal(b.job_title, null);
  assert.equal(b.grade, "Grade Two");
});

test("shift totals for the month are counted from the roster", async () => {
  const { adapter } = backend({
    ...profileRoute,
    "/getmyshifts": () => ({
      data: {
        userid: 41, shiftname: "General",
        all_shifts: [
          { date: "2026-09-01", clockin: "09:00 AM", clockout: "05:00 PM", hours: 8, display: "9-5" },
          { date: "2026-09-02", clockin: "09:00 AM", clockout: "05:00 PM", hours: 8, display: "9-5" },
          { date: "2026-09-05" },
        ],
      },
    }),
  });
  const identity = await adapter.resolveIdentity(ADA_TOKEN);
  const shifts = await adapter.getShifts(identity, { month: "2026-09" });
  assert.equal(shifts.shifts_in_month, 2);
  assert.equal(shifts.days_off_in_month, 1);
  assert.equal(shifts.hours_in_month, 16);
});

test("every shift date carries its weekday, so the model never works one out", async () => {
  const { adapter } = backend({
    ...profileRoute,
    "/getmyshifts": () => ({
      data: {
        userid: 41, shiftname: "General",
        upcoming_shifts: [
          { date: "2026-10-03", clockin: "09:00 AM", clockout: "05:00 PM", hours: 8, display: "9-5" },
          { date: "2026-10-04" },
        ],
      },
    }),
  });
  const identity = await adapter.resolveIdentity(ADA_TOKEN);
  const shifts = await adapter.getShifts(identity, { month: "2026-10" });
  assert.deepEqual(shifts.upcoming.map((d) => [d.date, d.weekday]), [
    ["2026-10-03", "Saturday"],
    ["2026-10-04", "Sunday"],
  ]);
});
