import { z } from "zod";
import { SAVABLE_TYPES } from "./policy.js";

const Extraction = z.object({
  save: z.array(
    z.object({
      type: z.enum(SAVABLE_TYPES),
      text: z.string().describe("One short third-person sentence, e.g. 'Wants to move into a team-lead role.'"),
      expires_in_days: z.number().int().nullable().describe("Only for time-bound facts; null otherwise."),
      replaces: z.array(z.string()).describe("Handles (m1, m2…) of existing memories this one corrects or updates."),
    }),
  ),
  forget: z.array(z.string()).describe("Handles of existing memories the employee asked to forget."),
});

const system = (today) => `You decide what an HR assistant should remember long-term about an employee, from the employee's latest message. Today is ${today}.

Remember only lasting, useful context the employee stated about THEMSELVES, that will change how the assistant helps them later:
- preference: how they want answers (length, format, language, tone), and working constraints ("prefers early shifts", "needs to leave by 4pm on weekdays" — the constraint only, never the personal reason behind it)
- goal: career or development goals
- focus: what they are learning or working on now
- plan: an intention with a time (e.g. wants the week of 22 December off). Set expires_in_days to the number of days from today until one week after that date.
- open_thread: something they started and have not finished, that they intend to follow up on
- achievement: something they say they completed, delivered, learned or were recognised for (e.g. "Automated the monthly payroll export."). Record it as they state it.
- knows: a how-to or process they already know, either because they say so ("I already know how to request leave") or because the assistant explained it in its previous message and they confirm it worked ("thanks, got it"). Procedures only, e.g. "Already knows how to submit a leave request in the app." Never a fact, figure or date.

Never remember:
- their current job title, role, seniority, department, team or authority ("I am the HR manager", "I'm a developer", "I moved to the backend team") — that comes from the HR record, which may differ from what they say
- HR records or numbers of any kind: leave balances, attendance, pay, shift times, dates the HR system reported
- health, disability, pregnancy, religion, ethnicity, sexuality, politics, union membership
- complaints, conflicts or opinions about a manager, colleague or anyone else; anything about another person
- credentials, bank or ID details
- questions, small talk, greetings, one-off requests, or anything the assistant said

Rules:
- Most messages contain nothing worth remembering. Return empty lists then.
- At most 3 new memories per message. Each holds exactly one fact, as one short sentence in the third person, without the employee's name.
- If the employee explicitly says "remember…", save it unless it is on the never list.
- Do not save something already in the existing memories. If the message makes any existing memory untrue or out of date, save the new fact and list the old handle in "replaces".
- If the employee asks to forget something ("forget that", "don't remember X"), list the matching handles in "forget".
- If the employee says an existing open_thread is finished or no longer needed ("I submitted it", "never mind that"), list its handle in "forget".
- Those are the only two reasons to forget. Asking a question, even about something in the existing memories, is never a reason to forget or replace one.`;

/**
 * @param {object} p
 * @param {ReturnType<import("../llm.js").createLlm>} p.llm
 * @param {{ id: string, type: string, text: string }[]} p.known  memories already held (recalled this turn)
 * @returns {Promise<{ save: object[], forget: string[] }>} with handles resolved back to memory ids
 */
export async function extractMemories({ llm, userMessage, previousAssistantMessage, known, today = new Date() }) {
  const handles = new Map(known.map((m, i) => [`m${i + 1}`, m.id]));
  const knownBlock = known.length
    ? known.map((m, i) => `m${i + 1}: [${m.type}] ${m.text}`).join("\n")
    : "(none)";

  const out = await llm.json({
    system: system(today.toISOString().slice(0, 10)),
    schema: Extraction,
    user:
      `<existing_memories>\n${knownBlock}\n</existing_memories>\n\n` +
      (previousAssistantMessage
        ? `<assistant_previous_message>\n${previousAssistantMessage}\n</assistant_previous_message>\n\n`
        : "") +
      `<employee_message>\n${userMessage}\n</employee_message>`,
  });
  if (!out) return { save: [], forget: [] };
  const resolve = (list) => list.map((h) => handles.get(h)).filter(Boolean);
  return {
    save: out.save.slice(0, 3).map((m) => ({
      type: m.type,
      text: m.text,
      expiresInDays: m.expires_in_days,
      replaces: resolve(m.replaces),
    })),
    forget: resolve(out.forget),
  };
}
