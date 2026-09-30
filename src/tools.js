import { z } from "zod";

const month = z
  .string()
  .regex(/^\d{4}-\d{2}$/)
  .optional()
  .describe("Month as YYYY-MM. Omit for the current month.");

/**
 * HR tools for one chat turn. The identity is bound here, on the server, from
 * the verified token — no tool takes an employee id, so the model cannot ask
 * for anyone else's data. Tool results are live HR records and are never
 * written to memory.
 *
 * `trace` collects which tools ran (for the "live HR lookups" note in the UI)
 * and any actions the employee must confirm in the app.
 */
export function buildTools(adapter, identity, trace) {
  const tool = (name, description, schema, fn) => ({
    name,
    description,
    schema,
    run: async (input) => {
      try {
        const result = await fn(input);
        trace.tools.push({ name, ok: true });
        return result;
      } catch (err) {
        trace.tools.push({ name, ok: false });
        return { error: `Could not fetch this from the HR system: ${err.message}` };
      }
    },
  });

  return [
    tool(
      "get_my_profile",
      "The signed-in employee's HR profile: name, role, department, branch, start date. Use for anything about their position or tenure.",
      z.object({}),
      () => adapter.getProfile(identity),
    ),
    tool(
      "get_my_leave_balance",
      "The employee's current leave entitlement, days used and days remaining per leave type. Always call this for leave-balance questions — balances change, never answer from memory.",
      z.object({ year: z.number().int().optional().describe("Leave year. Omit for the current year.") }),
      (input) => adapter.getLeaveBalance(identity, input),
    ),
    tool(
      "get_my_attendance_summary",
      "The employee's attendance summary for a month: days present, absent, times late.",
      z.object({ month }),
      (input) => adapter.getAttendanceSummary(identity, input),
    ),
    tool(
      "get_my_shifts",
      "The employee's upcoming shifts and days off for a month.",
      z.object({ month }),
      (input) => adapter.getShifts(identity, input),
    ),
    tool(
      "get_my_pay_summary",
      "The employee's pay summary for a month: gross, deductions, net. Only call when they explicitly ask about their pay.",
      z.object({ month }),
      (input) => adapter.getPaySummary(identity, input),
    ),
    tool(
      "draft_leave_request",
      "Prepare a leave request for the employee to review and submit themselves in the app. This does NOT submit anything. Check the leave balance first.",
      z.object({
        leave_type: z.string().describe("e.g. Annual"),
        start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        reason: z.string().max(300).optional(),
      }),
      async (input) => {
        trace.actions.push({ type: "leave_request_draft", ...input });
        return { drafted: true, note: "Shown to the employee as a form to review and submit. Not submitted." };
      },
    ),
  ];
}
