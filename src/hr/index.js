import { createAttendeeHrmAdapter } from "./attendeehrm.js";
import { mockAdapter } from "./mock.js";

/**
 * An HR adapter exposes:
 *   resolveIdentity(bearerToken) → { companyId, companyName, userId, pin, name } | null
 *   getProfile / getLeaveBalance / getAttendanceSummary / getShifts / getPaySummary (identity, args)
 * Every data method is scoped to the identity it is given — it never accepts
 * an employee id from anywhere else.
 */
export function getAdapter(name, { attendeeApiUrl, demoEnabled = false } = {}) {
  if (name === "mock") return mockAdapter;
  if (name === "attendeehrm") {
    const real = createAttendeeHrmAdapter({ apiUrl: attendeeApiUrl });
    return demoEnabled ? withDemoCompany(real) : real;
  }
  throw new Error(`Unknown HR_ADAPTER "${name}"`);
}

const DATA_METHODS = ["getProfile", "getLeaveBalance", "getAttendanceSummary", "getShifts", "getPaySummary"];

/**
 * The real adapter, plus the seeded demo company for the public demo page:
 * `demo-*` tokens sign in to the demo company, every other token goes to
 * AttendeeHRM. Each identity remembers which one verified it, so a demo
 * identity never reaches the real HR system and a real one never reaches the demo.
 */
export function withDemoCompany(real, demo = mockAdapter) {
  const routed = {
    name: `${real.name}+demo`,
    async resolveIdentity(token) {
      if (token.startsWith("demo-")) {
        const identity = await demo.resolveIdentity(token);
        return identity && { ...identity, demo: true };
      }
      return real.resolveIdentity(token);
    },
  };
  for (const method of DATA_METHODS) {
    routed[method] = (identity, args) => (identity.demo ? demo : real)[method](identity, args);
  }
  return routed;
}
