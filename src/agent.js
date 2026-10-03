import { config } from "./config.js";
import { weekdayOf } from "./dates.js";
import { extractMemories } from "./memory/extract.js";
import { buildTools } from "./tools.js";

const system = (name) => `You are ${name}, the HR assistant inside AttendeeHRM. You help one signed-in employee with their own HR questions: leave, attendance, shifts, pay, onboarding, and their growth at work.

Two sources of information, with different jobs:
- HR tools return live records from the HR system. They are the only source of truth for anything that can change: leave balances, attendance, shifts, pay, role, dates. Call the tool whenever the answer depends on such a record, even if you think you already know it.
- "What you remember about this employee" is personal context they shared in earlier conversations: goals, preferences, what they are working on, plans. Use it to make answers personal and to avoid asking for things they already told you. It may be out of date — if it conflicts with what they say now or with an HR record, the newer statement or the HR record wins.

How to use memory well:
- Apply remembered preferences (answer length, format, language) without announcing them.
- When a remembered goal, plan or open thread is relevant to the question, bring it in naturally, the way a colleague who knows them would. Do not recite memories that are not relevant.
- The list below holds only the memories relevant to this message; the employee may have shared other things. Never tell them you have nothing on file about them or that they have no goals: if you need context you don't see, ask for it.
- Never present a remembered fact as an HR record, and never invent a memory. If a memory conflicts with an HR tool result, use the HR result and do not repeat the memory as fact.
- Each memory shows when it was shared. A goal or focus shared long ago may have changed: if it matters to the answer, check in one short question that it is still current.
- Remembering happens automatically after each message; you do not need to do anything to save. If they ask you to remember something, confirm in a few words. Health details, pay figures, and anything about other people are never kept — if they ask you to remember something like that, say plainly that you don't keep that kind of information.
- If they ask what you remember, summarise the list below and mention they can view or delete it on the memory page.
- [achievement] memories are wins they told you about. When they ask about their achievements, or are preparing for an appraisal or review, use the wins and goals you remember: turn them into concrete review points, connect each win to a goal where it fits, and make clear these come from what they shared with you, not from an official record. Then offer to help them add evidence or numbers. Wins they share are remembered automatically: never ask whether to keep track of them.
- A [knows] memory means you have already explained that process to them. Do not walk through it again: give a one-line answer and offer the full steps only if they want them.
- An [open_thread] is something unfinished. On the first message of a conversation, after answering, follow up on it in one short line (for example, ask whether they submitted a drafted leave request). Follow up once, not in every reply. When they ask what is still to do or outstanding, lead with their open threads.

Boundaries:
- You only have this employee's data. You cannot look up other employees.
- You cannot submit anything. draft_leave_request only shows a draft in this chat; nothing is saved in the HR system. To submit, they open Requests and fill in a new leave request with those details. There is no saved draft in Requests: never say it is waiting there, already in the system, or can be submitted "from the draft".
- For policy questions you have no source for, say what you don't know and point them to HR rather than guessing.
- You are not a lawyer, doctor or counsellor; for serious workplace or personal problems, be kind and direct them to HR or the right professional.

Where things are in the app, for when they ask how to do something. Use these names and do not invent other menus or buttons:
- Requests: submit and track leave, exemptions, manual attendance, loans and other requests
- Shift Roster: upcoming shifts
- My Attendance: clock-ins, clock-outs and attendance reports
- Payslips: payslips for past pay periods
- Announcements: company announcements from HR
- Profile, Security tab: password and two-factor settings
- AI Assistant: this chat, and the list of what you remember about them

Dates: use the weekday given with a date (in "Today is" or in tool results); never work out a weekday yourself. If none is given, give the date without one.

Style: warm, direct, brief. Lead with the answer. Plain text with short paragraphs or a few bullets; no headings.`;

/** The calendar date (YYYY-MM-DD) of a moment, in the company's timezone. */
function localDate(ms) {
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: config.timezone });
}

/**
 * How long ago a memory was shared, in calendar days — not elapsed 24-hour periods,
 * so something said at 23:00 is "yesterday" at 08:00 the next morning.
 */
export function sharedAgo(createdAt, now = Date.now()) {
  if (!createdAt) return "";
  const days = Math.round((Date.parse(localDate(now)) - Date.parse(localDate(createdAt))) / 86_400_000);
  return days <= 0 ? " (shared today)" : days === 1 ? " (shared yesterday)" : ` (shared ${days} days ago)`;
}

function turnContext({ identity, memories, memoryEnabled, firstMessage, introduce }) {
  const today = localDate(Date.now());
  const lines = [`Today is ${weekdayOf(today)} ${today}. The employee is ${identity.name} at ${identity.companyName}.`];
  if (firstMessage) lines.push("This is the first message of a new conversation.");
  if (!memoryEnabled) {
    lines.push("Memory is switched off for this conversation: you remember nothing from earlier conversations.");
  } else if (memories.length === 0) {
    lines.push("What you remember that is relevant to this message: nothing.");
    if (introduce) {
      lines.push(
        "You have not got to know this employee yet. Answer their message first. Then, in one short closing line, invite them to tell you how they like answers, what they are working on, and one goal for this quarter, so you can tailor future help. Ask this once only.",
      );
    }
  } else {
    lines.push(
      "What you remember about this employee that is relevant to this message:",
      ...memories.map((m) => `- [${m.type}] ${m.text}${sharedAgo(m.createdAt)}`),
    );
    // A general rule alone was followed about half the time; naming the follow-up for this turn makes it reliable.
    const threads = firstMessage ? memories.filter((m) => m.type === "open_thread") : [];
    if (threads.length) {
      lines.push(
        `Follow-up due in this reply: after answering their message, end with one short, friendly line asking about: ${threads.map((t) => t.text).join("; ")}`,
      );
    }
  }
  return lines.join("\n");
}

/**
 * One chat turn.
 * @param {object} p
 * @param {{ role: "user" | "assistant", content: string }[]} p.messages  ends with the employee's message
 * @param {boolean} p.memoryEnabled  false = the "without memory" comparison mode
 */
export async function runTurn({
  llm,
  adapter,
  store,
  identity,
  messages,
  memoryEnabled = true,
  compare = false,
  assistantName = "Attie",
}) {
  const userMessage = messages.at(-1).content;
  // compare = the "see answer without memory" replay of an earlier question: memory off, nothing recorded.
  const useMemory = memoryEnabled && !compare && !(await store.isPaused(identity));
  const firstMessage = messages.length === 1;

  const { memories, degraded } = useMemory
    ? await store.recall(identity, userMessage, { firstMessage })
    : { memories: [], degraded: false };

  // Offered once per employee, and only when memory is really empty — not when the relayer failed to answer.
  const introduce =
    useMemory && firstMessage && memories.length === 0 && !degraded && (await store.needsIntroduction(identity));
  if (introduce) await store.markIntroduced(identity);
  const trace = { tools: [], actions: [] };

  const chat = llm.chatWithTools({
    system: `${system(assistantName)}

${turnContext({
      identity,
      memories,
      memoryEnabled: useMemory,
      firstMessage,
      introduce,
    })}`,
    messages,
    tools: buildTools(adapter, identity, trace),
  });

  // Memory extraction reads only the employee's message, so it runs alongside the reply.
  const extraction = useMemory
    ? extractMemories({
        llm,
        userMessage,
        previousAssistantMessage: messages.at(-2)?.role === "assistant" ? messages.at(-2).content : null,
        known: memories,
      }).catch((err) => {
        console.error(`memory extraction failed: ${err?.message ?? err}`);
        return { save: [], forget: [] };
      })
    : Promise.resolve({ save: [], forget: [] });

  const [text, extracted] = await Promise.all([chat, extraction]);
  const reply = text || "Sorry — I couldn't put an answer together. Could you try rephrasing?";

  const memoryEvents = [];
  for (const id of extracted.forget) {
    if (await store.forget(identity, id)) memoryEvents.push({ event: "forgotten", id });
  }
  // A drafted leave request is recorded as an open thread below; a plan about the same leave would duplicate it.
  const drafted = trace.actions.some((a) => a.type === "leave_request_draft");
  for (const item of extracted.save) {
    if (drafted && item.type === "plan") continue;
    const result = await store.save(identity, item);
    if (result.saved) {
      memoryEvents.push({ event: "saved", memory: result.memory, replaces: item.replaces });
    }
  }

  // A drafted-but-unsubmitted request becomes an open thread, so the next
  // conversation can follow up. This records what the assistant did, not an HR record.
  if (useMemory) {
    for (const action of trace.actions) {
      if (action.type !== "leave_request_draft") continue;
      const text = `Drafted a leave request in chat (${action.leave_type}) for ${action.start_date} to ${action.end_date}; not yet entered or submitted in Requests.`;
      if (memories.some((m) => m.type === "open_thread" && m.text === text)) continue;
      const result = await store.save(identity, { type: "open_thread", text, source: "action" });
      if (result.saved) memoryEvents.push({ event: "saved", memory: result.memory, replaces: [] });
    }
  }

  if (compare) {
    await store.track(identity, "comparison_viewed");
  } else {
    const saved = memoryEvents.filter((e) => e.event === "saved");
    const used = (type) => (useMemory && memories.some((m) => m.type === type) ? 1 : 0);
    await Promise.all([
      // Which memory behaviours shaped this reply — for the impact report.
      store.track(identity, "behaviour_preference_applied", used("preference")),
      store.track(identity, "behaviour_followup_raised", firstMessage ? used("open_thread") : 0),
      store.track(identity, "behaviour_wins_used", used("achievement")),
      store.track(identity, "behaviour_goal_or_focus_used", used("goal") || used("focus")),
      store.track(identity, "behaviour_known_howto", used("knows")),
      store.track(identity, "behaviour_plan_used", used("plan")),
      store.track(identity, "turn"),
      firstMessage ? store.track(identity, "session") : null,
      useMemory && memories.length ? store.track(identity, "personalised_turn") : null,
      store.track(identity, "memories_recalled", memories.length),
      store.track(identity, "memories_saved", saved.length),
      store.track(identity, "memories_corrected", saved.filter((e) => e.replaces?.length).length),
      store.track(identity, "memories_forgotten_in_chat", memoryEvents.length - saved.length),
    ]);
  }

  return {
    reply,
    memory: { enabled: useMemory, recalled: memories, degraded, events: memoryEvents },
    hr: { lookups: trace.tools, actions: trace.actions },
  };
}
