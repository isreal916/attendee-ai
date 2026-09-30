import { extractMemories } from "./memory/extract.js";
import { buildTools } from "./tools.js";

const system = (name) => `You are ${name}, the HR assistant inside AttendeeHRM. You help one signed-in employee with their own HR questions: leave, attendance, shifts, pay, onboarding, and their growth at work.

Two sources of information, with different jobs:
- HR tools return live records from the HR system. They are the only source of truth for anything that can change: leave balances, attendance, shifts, pay, role, dates. Call the tool whenever the answer depends on such a record, even if you think you already know it.
- "What you remember about this employee" is personal context they shared in earlier conversations: goals, preferences, what they are working on, plans. Use it to make answers personal and to avoid asking for things they already told you. It may be out of date — if it conflicts with what they say now or with an HR record, the newer statement or the HR record wins.

How to use memory well:
- Apply remembered preferences (answer length, format, language) without announcing them.
- When a remembered goal, plan or open thread is relevant to the question, bring it in naturally, the way a colleague who knows them would. Do not recite memories that are not relevant.
- Never present a remembered fact as an HR record, and never invent a memory.
- Remembering happens automatically after each message; you do not need to do anything to save. If they ask you to remember something, confirm in a few words. Health details, pay figures, and anything about other people are never kept — if they ask you to remember something like that, say plainly that you don't keep that kind of information.
- If they ask what you remember, summarise the list below and mention they can view or delete it on the memory page.

Boundaries:
- You only have this employee's data. You cannot look up other employees.
- You cannot submit anything. draft_leave_request prepares a form they review and submit themselves.
- For policy questions you have no source for, say what you don't know and point them to HR rather than guessing.
- You are not a lawyer, doctor or counsellor; for serious workplace or personal problems, be kind and direct them to HR or the right professional.

Style: warm, direct, brief. Lead with the answer. Plain text with short paragraphs or a few bullets; no headings.`;

function turnContext({ identity, memories, memoryEnabled }) {
  const today = new Date().toISOString().slice(0, 10);
  const lines = [`Today is ${today}. The employee is ${identity.name} at ${identity.companyName}.`];
  if (!memoryEnabled) {
    lines.push("Memory is switched off for this conversation: you remember nothing from earlier conversations.");
  } else if (memories.length === 0) {
    lines.push("What you remember about this employee: nothing yet.");
  } else {
    lines.push(
      "What you remember about this employee:",
      ...memories.map((m) => `- [${m.type}] ${m.text}`),
    );
  }
  return lines.join("\n");
}

/**
 * One chat turn.
 * @param {object} p
 * @param {{ role: "user" | "assistant", content: string }[]} p.messages  ends with the employee's message
 * @param {boolean} p.memoryEnabled  false = the "without memory" comparison mode
 */
export async function runTurn({ llm, adapter, store, identity, messages, memoryEnabled = true, assistantName = "Attie" }) {
  const userMessage = messages.at(-1).content;
  const useMemory = memoryEnabled && !store.isPaused(identity);

  const { memories, degraded } = useMemory
    ? await store.recall(identity, userMessage)
    : { memories: [], degraded: false };

  const trace = { tools: [], actions: [] };

  const chat = llm.chatWithTools({
    system: `${system(assistantName)}

${turnContext({ identity, memories, memoryEnabled: useMemory })}`,
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
  for (const item of extracted.save) {
    const result = store.save(identity, item);
    if (result.saved) {
      memoryEvents.push({ event: "saved", memory: result.memory, replaces: item.replaces });
    }
  }

  return {
    reply,
    memory: { enabled: useMemory, recalled: memories, degraded, events: memoryEvents },
    hr: { lookups: trace.tools, actions: trace.actions },
  };
}
