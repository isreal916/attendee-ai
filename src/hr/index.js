import { createAttendeeHrmAdapter } from "./attendeehrm.js";
import { mockAdapter } from "./mock.js";

/**
 * An HR adapter exposes:
 *   resolveIdentity(bearerToken) → { companyId, companyName, userId, pin, name } | null
 *   getProfile / getLeaveBalance / getAttendanceSummary / getShifts / getPaySummary (identity, args)
 * Every data method is scoped to the identity it is given — it never accepts
 * an employee id from anywhere else.
 */
export function getAdapter(name, { attendeeApiUrl } = {}) {
  if (name === "mock") return mockAdapter;
  if (name === "attendeehrm") return createAttendeeHrmAdapter({ apiUrl: attendeeApiUrl });
  throw new Error(`Unknown HR_ADAPTER "${name}"`);
}
