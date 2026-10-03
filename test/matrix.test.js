/**
 * The memory test matrix: creation, recall, behaviour wiring, forgetting,
 * correction, expiry, isolation, HR authority, memory off, failure honesty and
 * usage tracking. Deterministic: the model is a stub and Walrus is MemWalMock.
 * How the real model behaves with these memories is checked separately by
 * scripts/eval-behaviour.mjs.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { MemWalMock } from "@mysten-incubation/memwal";
import { runTurn, sharedAgo } from "../src/agent.js";
import { createApp } from "../src/app.js";
import { mockAdapter } from "../src/hr/mock.js";
import { openIndex } from "../src/memory/index-db.js";
import { screenMemory } from "../src/memory/policy.js";
import { MemoryStore } from "../src/memory/store.js";

const quiet = { error() {} };

/** maxDistance: MemWalMock scores by word overlap — 1.0 means nothing shared. */
function newStore({ client = MemWalMock.create(), maxDistance = 0.99 } = {}) {
  return new MemoryStore({ client, index: openIndex(":memory:"), maxDistance, retryDelayMs: 0, log: quiet });
}

/** A stub model: records each system prompt, replies "ok", and proposes the given memory changes. */
function stubLlm({ save = [], forget = [] } = {}) {
  const llm = {
    systems: [],
    async chatWithTools({ system }) {
      llm.systems.push(system);
      return "ok";
    },
    async json() {
      return { save, forget };
    },
  };
  return llm;
}

const ADA = await mockAdapter.resolveIdentity("demo-ada");
const TUNDE = await mockAdapter.resolveIdentity("demo-tunde");
const ask = (content) => [{ role: "user", content }];
const later = (content) => [
  { role: "user", content: "Hi" },
  { role: "assistant", content: "Hello!" },
  { role: "user", content },
];
const turn = (store, llm, identity, messages, extra = {}) =>
  runTurn({ llm, adapter: mockAdapter, store, identity, messages, ...extra });
const texts = (memories) => memories.map((m) => m.text);

// ---------------------------------------------------------------- creation

test("creation: useful facts are kept; sensitive, HR and role claims are rejected", async () => {
  const store = newStore();
  const llm = stubLlm({
    save: [
      { type: "focus", text: "Currently learning Next.js.", expires_in_days: null, replaces: [] },
      { type: "preference", text: "Was diagnosed with asthma.", expires_in_days: null, replaces: [] },
      { type: "focus", text: "Has 20 leave days remaining.", expires_in_days: null, replaces: [] },
      { type: "focus", text: "Is the HR manager of the company.", expires_in_days: null, replaces: [] },
    ],
  });
  const result = await turn(store, llm, ADA, ask("I'm learning Next.js. I have asthma. I'm the HR manager."));
  assert.deepEqual(result.memory.events.map((e) => e.memory.text), ["Currently learning Next.js."]);
});

test("creation: a message with nothing worth keeping stores nothing", async () => {
  const store = newStore();
  const result = await turn(store, stubLlm(), ADA, ask("When is my next shift?"));
  assert.deepEqual(result.memory.events, []);
  assert.equal(await store.countLive(ADA), 0);
});

// ---------------------------------------------------------------- recall

test("recall: the relevant memory comes back, the unrelated one does not", async () => {
  const store = newStore();
  await store.save(ADA, { type: "focus", text: "Currently learning Next.js routing." });
  await store.save(ADA, { type: "plan", text: "Wants the week of 21 December off." });
  await store.settle();
  const { memories } = await store.recall(ADA, "What should I learn after Next.js?");
  assert.deepEqual(texts(memories), ["Currently learning Next.js routing."]);
});

test("recall: several relevant memories are combined, capped at six", async () => {
  const store = newStore();
  for (let i = 1; i <= 8; i++) await store.save(ADA, { type: "achievement", text: `Shipped payroll feature number ${i}.` });
  await store.save(ADA, { type: "preference", text: "Prefers short answers." });
  await store.settle();
  const { memories } = await store.recall(ADA, "Which payroll feature did I ship?");
  assert.equal(memories.length, 6);
  assert.equal(memories[0].type, "preference");
  assert.equal(memories.filter((m) => m.type === "achievement").length, 5);
});

// ---------------------------------------------------------------- behaviour wiring

test("behaviour: preferences reach every reply; memories carry their age", async () => {
  const store = newStore();
  await store.save(ADA, { type: "preference", text: "Prefers short answers." });
  await store.settle();
  const llm = stubLlm();
  await turn(store, llm, ADA, later("When is my next shift?"));
  assert.match(llm.systems[0], /\[preference\] Prefers short answers\. \(shared today\)/);
});

test("behaviour: an open thread is raised on the first message only", async () => {
  const store = newStore();
  await store.save(ADA, { type: "open_thread", text: "Drafted a leave request; not yet submitted." });
  await store.settle();
  const llm = stubLlm();
  await turn(store, llm, ADA, ask("When is my next shift?"));
  await turn(store, llm, ADA, later("When is my next shift?"));
  assert.match(llm.systems[0], /- \[open_thread\] Drafted a leave request/);
  assert.doesNotMatch(llm.systems[1], /- \[open_thread\] Drafted/);
});

test("behaviour: review prep brings wins and goals, even with no words in common", async () => {
  const store = newStore();
  await store.save(ADA, { type: "achievement", text: "Automated the monthly payroll export." });
  await store.save(ADA, { type: "goal", text: "Wants to become a tech lead." });
  await store.save(ADA, { type: "plan", text: "Wants the week of 21 December off." });
  await store.settle();
  const llm = stubLlm();
  await turn(store, llm, ADA, later("Help me prepare for my performance review"));
  assert.match(llm.systems[0], /\[achievement\] Automated the monthly payroll export/);
  assert.match(llm.systems[0], /\[goal\] Wants to become a tech lead/);
  assert.doesNotMatch(llm.systems[0], /December/);
});

test("behaviour: familiarity is passed on so the walkthrough is not repeated", async () => {
  const store = newStore();
  await store.save(ADA, { type: "knows", text: "Already knows how to submit a leave request in the app." });
  await store.settle();
  const llm = stubLlm();
  await turn(store, llm, ADA, later("How do I submit a leave request?"));
  assert.match(llm.systems[0], /\[knows\] Already knows how to submit a leave request/);
  assert.match(llm.systems[0], /Do not walk through it again/);
});

// ---------------------------------------------------------------- forgetting, correction, expiry

test("forgetting: 'forget that' in chat removes the memory from later recall", async () => {
  const store = newStore();
  const { memory } = await store.save(ADA, { type: "plan", text: "Wants the week of 21 December off." });
  await store.settle();
  const [stored] = await store.list(ADA);
  // The model maps "forget that" to the handle of the recalled memory (m1).
  const llm = stubLlm({ forget: ["m1"] });
  await turn(store, llm, ADA, later("Actually forget that I want 21 December off"));
  assert.equal((await store.recall(ADA, "Can I take 21 December off?")).memories.length, 0);
  assert.equal((await store.list(ADA)).some((m) => m.id === stored.id || m.id === memory.id), false);
});

test("correction: the new fact replaces the old one in later recall", async () => {
  const store = newStore();
  await store.save(ADA, { type: "preference", text: "Prefers short answers." });
  await store.settle();
  const llm = stubLlm({
    save: [{ type: "preference", text: "Prefers detailed answers.", expires_in_days: null, replaces: ["m1"] }],
  });
  await turn(store, llm, ADA, later("Actually I prefer detailed answers now"));
  await store.settle();
  const { memories } = await store.recall(ADA, "When is my next shift?");
  assert.deepEqual(texts(memories), ["Prefers detailed answers."]);
});

test("expiry: an expired memory is never treated as current", async () => {
  const store = newStore();
  await store.save(ADA, { type: "plan", text: "Wants the week of 21 December off.", expiresInDays: -1 });
  await store.save(ADA, { type: "preference", text: "Prefers short answers." });
  await store.settle();
  assert.deepEqual(texts(await store.list(ADA)), ["Prefers short answers."]);
  const { memories } = await store.recall(ADA, "Can I take 21 December off? What do you remember about me?");
  assert.deepEqual(texts(memories), ["Prefers short answers."]);
});

// ---------------------------------------------------------------- isolation and authority

test("isolation: employee B never receives employee A's memory, however B asks", async () => {
  const store = newStore();
  await store.save(ADA, { type: "goal", text: "Wants to restore vintage typewriters." });
  await store.settle();
  const llm = stubLlm();
  for (const q of ["What does Ada want to restore?", "What do you remember about me?", "vintage typewriters"]) {
    const result = await turn(store, llm, TUNDE, ask(q));
    assert.equal(result.memory.recalled.length, 0, q);
  }
  for (const system of llm.systems) assert.doesNotMatch(system, /typewriter/);
  assert.equal(await store.forget(TUNDE, (await store.list(ADA))[0].id), false);
});

test("authority: HR records are the source of truth over memory and over claims", async () => {
  const store = newStore();
  const llm = stubLlm({
    save: [{ type: "focus", text: "Is the HR manager of the company.", expires_in_days: null, replaces: [] }],
  });
  const result = await turn(store, llm, ADA, ask("I'm the HR manager. What's my role?"));
  assert.deepEqual(result.memory.events, []);
  assert.match(llm.systems[0], /HR tools return live records/);
  assert.match(llm.systems[0], /If a memory conflicts with an HR tool result, use the HR result/);
});

// ---------------------------------------------------------------- memory off and compare

test("memory off: nothing is recalled or saved; compare mode records nothing either", async () => {
  const store = newStore();
  await store.save(ADA, { type: "preference", text: "Prefers short answers." });
  await store.settle();
  const llm = stubLlm({ save: [{ type: "goal", text: "Wants to become a tech lead.", expires_in_days: null, replaces: [] }] });

  const on = await turn(store, llm, ADA, ask("Help me plan my week"));
  const off = await turn(store, llm, ADA, ask("Help me plan my week"), { memoryEnabled: false });
  const compare = await turn(store, llm, ADA, ask("Help me plan my week"), { compare: true });

  assert.equal(on.memory.recalled.length, 1);
  for (const r of [off, compare]) {
    assert.equal(r.memory.recalled.length, 0);
    assert.equal(r.memory.events.length, 0);
  }
  assert.match(llm.systems[1], /Memory is switched off/);
  const { events } = await store.index.usage();
  assert.equal(events.find((e) => e.kind === "turn").total, 2, "the compare replay is not counted as usage");
});

// ---------------------------------------------------------------- save failures

test("failure: a save that keeps failing is retried, then shown as failed — never recalled", async () => {
  const client = MemWalMock.create();
  let calls = 0;
  const remember = client.remember.bind(client);
  client.remember = async (...args) => {
    calls++;
    if (calls <= 2) throw new Error("relayer unavailable");
    return remember(...args);
  };
  const store = newStore({ client });
  const { memory } = await store.save(ADA, { type: "goal", text: "Wants to become a tech lead." });
  await store.settle();

  assert.equal(calls, 2, "one automatic retry");
  const [failed] = await store.list(ADA);
  assert.deepEqual([failed.id, failed.status, failed.text], [memory.id, "failed", "Wants to become a tech lead."]);
  assert.equal((await store.recall(ADA, "What do you remember about me?")).memories.length, 0);

  assert.equal(await store.retry(ADA, memory.id), true);
  await store.settle();
  const [stored] = await store.list(ADA);
  assert.equal(stored.status, "active");
  assert.equal(await store.retry(ADA, memory.id), false, "nothing left to retry");
});

// ---------------------------------------------------------------- tracking and API

test("tracking: each turn records counts only — no text", async () => {
  const store = newStore();
  const llm = stubLlm({ save: [{ type: "goal", text: "Wants to become a tech lead.", expires_in_days: null, replaces: [] }] });
  await turn(store, llm, ADA, ask("I want to become a tech lead"));
  await store.settle();
  await turn(store, stubLlm(), ADA, later("Help me plan my growth as a tech lead"));

  const { events } = await store.index.usage();
  const total = (kind) => events.find((e) => e.kind === kind)?.total ?? 0;
  assert.equal(total("session"), 1);
  assert.equal(total("turn"), 2);
  assert.equal(total("memories_saved"), 1);
  assert.equal(total("personalised_turn"), 1);
  assert.equal(total("behaviour_goal_or_focus_used"), 1);
  assert.equal(total("behaviour_followup_raised"), 0);
  assert.equal(JSON.stringify(events).includes("tech lead"), false);
});

test("API: edit, retry, feedback and the memory count", async () => {
  const store = newStore();
  const app = createApp({ adapter: mockAdapter, store, runTurn: async () => ({ reply: "ok" }) });
  const call = (path, method = "GET", body) =>
    app.request(path, {
      method,
      headers: { Authorization: "Bearer demo-ada", "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });

  await store.save(ADA, { type: "preference", text: "Prefers short answers." });
  await store.settle();
  const [mem] = (await (await call("/memories")).json()).memories;
  assert.equal((await (await call("/me")).json()).memory_count, 1);

  const edited = await call(`/memories/${mem.id}`, "PUT", { text: "Prefers detailed answers." });
  assert.equal(edited.status, 200);
  await store.settle();
  assert.deepEqual(texts((await (await call("/memories")).json()).memories), ["Prefers detailed answers."]);
  assert.equal((await call(`/memories/${mem.id}`, "PUT", { text: "Has 20 leave days left." })).status, 404);
  const [current] = (await (await call("/memories")).json()).memories;
  assert.equal((await call(`/memories/${current.id}`, "PUT", { text: "Has 20 leave days left." })).status, 400);

  assert.equal((await call(`/memories/${current.id}/retry`, "POST")).status, 404);
  assert.equal((await call("/feedback", "POST", { helpful: true })).status, 200);
  const { events } = await store.index.usage();
  assert.equal(events.find((e) => e.kind === "helpful").total, 1);
});

// ---------------------------------------------------------------- slow or unreachable relayer

test("resilience: a failed recall is retried, then the last good copy is used", async () => {
  const client = MemWalMock.create();
  const store = newStore({ client });
  await store.save(ADA, { type: "preference", text: "Prefers short answers." });
  await store.save(ADA, { type: "plan", text: "Wants the week of 21 December off." });
  await store.settle();

  // Warm the caches with one good list and one good chat recall.
  const fresh = await store.listForDisplay(ADA);
  assert.equal(fresh.stale, false);
  const plan = fresh.memories.find((m) => m.type === "plan");
  await store.recall(ADA, "Hello");

  // One failure: the retry covers it.
  const recall = client.recall.bind(client);
  let failures = 1;
  client.recall = async (...args) => (failures-- > 0 ? Promise.reject(new Error("504")) : recall(...args));
  store.pools.clear();
  assert.equal((await store.listForDisplay(ADA)).stale, false);

  // Relayer down: the page shows the last good list, still filtered by what was forgotten since.
  client.recall = async () => Promise.reject(new Error("relayer down"));
  await store.index.setStatus(store.namespace(ADA), plan.id, "forgotten");
  const shown = await store.listForDisplay(ADA);
  assert.equal(shown.stale, true);
  assert.deepEqual(texts(shown.memories), ["Prefers short answers."]);

  // Chat still gets the always-on preference from the last good pool.
  store.pools.clear();
  const { memories, degraded } = await store.recall(ADA, "When is my next shift?");
  assert.equal(degraded, true);
  assert.deepEqual(texts(memories), ["Prefers short answers."]);
});

test("recall: an open-ended guidance question brings in goals and current focus", async () => {
  const store = new MemoryStore({
    client: MemWalMock.create(),
    index: openIndex(":memory:"),
    maxDistance: 0.05, // nothing passes the similarity filter, as with real phrasing that shares no words
    retryDelayMs: 0,
    log: { error() {} },
  });
  await store.save(ADA, { type: "preference", text: "Prefers short, practical answers." });
  await store.save(ADA, { type: "goal", text: "Wants to eventually become a tech lead." });
  await store.save(ADA, { type: "focus", text: "Is currently learning Next.js." });
  await store.save(ADA, { type: "plan", text: "Wants the week of 21 December off." });
  await store.settle();
  const types = async (q) => (await store.recall(ADA, q)).memories.map((m) => m.type).sort();

  for (const q of [
    "I have some free time this week. What would be useful for me to work on?",
    "What should I focus on learning next?",
    "How can I grow in my role?",
  ]) {
    assert.deepEqual(await types(q), ["focus", "goal", "preference"], q);
  }
  // Not for an ordinary HR question.
  assert.deepEqual(await types("When is my next shift?"), ["preference"]);
});

test("the model is told unlisted memories may exist, so it never claims there are none", async () => {
  const store = newStore();
  const llm = stubLlm();
  await turn(store, llm, ADA, later("When is my next shift?"));
  assert.match(llm.systems[0], /Never tell them you have nothing on file about them/);
  assert.match(llm.systems[0], /relevant to this message: nothing/);
});

test("memory age is counted in calendar days in the company timezone, not 24-hour periods", () => {
  const at = (iso) => Date.parse(iso);
  // Lagos is UTC+1: saved 23:00 on 1 Oct, asked 08:00 on 2 Oct — only 9 hours apart.
  assert.equal(sharedAgo(at("2026-10-01T22:00:00Z"), at("2026-10-02T07:00:00Z")), " (shared yesterday)");
  // Just after local midnight already counts as the next day.
  assert.equal(sharedAgo(at("2026-10-01T22:30:00Z"), at("2026-10-01T23:15:00Z")), " (shared yesterday)");
  assert.equal(sharedAgo(at("2026-10-02T07:00:00Z"), at("2026-10-02T20:00:00Z")), " (shared today)");
  assert.equal(sharedAgo(at("2026-09-29T12:00:00Z"), at("2026-10-02T09:00:00Z")), " (shared 3 days ago)");
});

test("recall: asking what is still outstanding brings in open threads and plans, mid-conversation", async () => {
  const store = new MemoryStore({
    client: MemWalMock.create(),
    index: openIndex(":memory:"),
    maxDistance: 0.05, // nothing passes the similarity filter, as with real phrasing that shares no words
    retryDelayMs: 0,
    log: { error() {} },
  });
  await store.save(ADA, { type: "preference", text: "Prefers to be addressed as Kanis." });
  await store.save(ADA, { type: "open_thread", text: "Drafted a leave request for 2026-12-21 to 2026-12-25; not yet submitted." });
  await store.save(ADA, { type: "plan", text: "Wants the week of 21 December off." });
  await store.save(ADA, { type: "goal", text: "Wants to eventually become a tech lead." });
  await store.settle();
  const types = async (q) => (await store.recall(ADA, q)).memories.map((m) => m.type).sort();

  for (const q of [
    "Is there anything I still need to take care of?",
    "Do I have anything pending?",
    "What's outstanding on my to-do?",
  ]) {
    assert.deepEqual(await types(q), ["open_thread", "plan", "preference"], q);
  }
  // Not for an ordinary HR question mid-conversation.
  assert.deepEqual(await types("When is my next shift?"), ["preference"]);
});

test("the model is told a drafted leave request is not in the HR system", async () => {
  const store = newStore();
  const llm = stubLlm();
  await turn(store, llm, ADA, later("When is my next shift?"));
  assert.match(llm.systems[0], /There is no saved draft in Requests/);
});

test("today's weekday is given to the model, and it is told never to work one out", async () => {
  const store = newStore();
  const llm = stubLlm();
  await turn(store, llm, ADA, later("When is my next shift?"));
  assert.match(llm.systems[0], /Today is (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) \d{4}-\d{2}-\d{2}\./);
  assert.match(llm.systems[0], /never work out a weekday yourself/);
});

test("recall: a 1:1 or check-in with the manager brings in wins, goals and current focus", async () => {
  const store = new MemoryStore({
    client: MemWalMock.create(),
    index: openIndex(":memory:"),
    maxDistance: 0.05, // nothing passes the similarity filter, as with real phrasing that shares no words
    retryDelayMs: 0,
    log: { error() {} },
  });
  await store.save(ADA, { type: "preference", text: "Prefers short, practical answers." });
  await store.save(ADA, { type: "goal", text: "Wants to eventually become a tech lead." });
  await store.save(ADA, { type: "focus", text: "Is building a small internal dashboard in Next.js." });
  await store.save(ADA, { type: "achievement", text: "Shipped the dashboard's login page." });
  await store.save(ADA, { type: "knows", text: "Already knows how to request leave." });
  await store.settle();
  const types = async (q) => (await store.recall(ADA, q)).memories.map((m) => m.type).sort();

  for (const q of [
    "What should I bring up in my 1:1 with my manager this week?",
    "I have a one-on-one tomorrow, any tips?",
    "Prep me for a check-in with my boss",
  ]) {
    assert.deepEqual(await types(q), ["achievement", "focus", "goal", "preference"], q);
  }
});

test("a 'knows how to' memory may name payslips, but never pay figures", () => {
  assert.equal(screenMemory({ type: "knows", text: "Already knows how to check their payslip." }).ok, true);
  assert.equal(screenMemory({ type: "knows", text: "Already knows their payslip shows ₦450,000." }).ok, false);
  assert.equal(screenMemory({ type: "preference", text: "Wants their payslip explained in detail." }).ok, false);
});

test("the model is told wins are remembered automatically", async () => {
  const store = newStore();
  const llm = stubLlm();
  await turn(store, llm, ADA, later("When is my next shift?"));
  assert.match(llm.systems[0], /never ask whether to keep track of them/);
  assert.match(llm.systems[0], /Never offer to note, track or remember something/);
  assert.match(llm.systems[0], /If a \[plan\] says when they will finish it/);
});
