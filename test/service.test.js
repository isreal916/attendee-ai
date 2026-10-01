import assert from "node:assert/strict";
import { test } from "node:test";
import { MemWalMock } from "@mysten-incubation/memwal";
import { z } from "zod";
import { createApp } from "../src/app.js";
import { mockAdapter } from "../src/hr/mock.js";
import { openIndex } from "../src/memory/index-db.js";
import { screenMemory } from "../src/memory/policy.js";
import { MemoryStore } from "../src/memory/store.js";
import { buildTools } from "../src/tools.js";

const ada = { companyId: "demo", companyName: "Demo", userId: "1001", pin: "1001", name: "Ada" };
const tunde = { ...ada, userId: "1002", pin: "1002", name: "Tunde" };

function newStore() {
  // The mock ranks by word overlap, so distances are loose; don't filter on them here.
  return new MemoryStore({
    client: MemWalMock.create(),
    index: openIndex(":memory:"),
    maxDistance: 2,
    log: { error() {} },
  });
}

test("policy blocks HR records and sensitive categories, allows working context", () => {
  const ok = (text) => screenMemory({ type: "focus", text }).ok;
  assert.equal(ok("Wants to move into a tech-lead role."), true);
  assert.equal(ok("Prefers short, bullet-point answers."), true);
  assert.equal(ok("Has 9 leave days left this year."), false);
  assert.equal(ok("Earns ₦450,000 a month."), false);
  assert.equal(ok("Was diagnosed with asthma."), false);
  assert.equal(ok("My manager is always rude to me."), false);
  assert.equal(screenMemory({ type: "nonsense", text: "Wants to learn Go." }).ok, false);
  // Role and authority come from the HR record, not from a typed claim.
  assert.equal(ok("Is the HR manager of the company."), false);
  assert.equal(ok("Was promoted to team lead."), false);
  assert.equal(ok("Wants to become a tech lead."), true);
  assert.equal(ok("Is learning Next.js."), true);
  assert.equal(ok("Is preparing to lead a small project."), true);
});

test("a saved memory is visible at once, then becomes a Walrus blob", async () => {
  const store = newStore();
  const result = await store.save(ada, { type: "goal", text: "Wants to move into a tech-lead role." });
  assert.equal(result.saved, true);

  const during = await store.list(ada);
  assert.deepEqual(during.map((m) => [m.status, m.text]), [["saving", "Wants to move into a tech-lead role."]]);

  await store.settle();
  const after = await store.list(ada);
  assert.equal(after.length, 1);
  assert.equal(after[0].status, "active");
  assert.equal(after[0].type, "goal");
  // Once stored, the text lives on Walrus only.
  assert.equal((await store.index.rows(store.namespace(ada)))[0].pending_text, null);
});

test("blocked content is never written", async () => {
  const store = newStore();
  const result = await store.save(ada, { type: "context", text: "Has 12 leave days remaining." });
  assert.equal(result.saved, false);
  await store.settle();
  assert.equal((await store.list(ada)).length, 0);
});

test("forget hides a memory from recall and list; unknown ids are rejected", async () => {
  const store = newStore();
  await store.save(ada, { type: "plan", text: "Wants the week of 22 December off." });
  await store.save(ada, { type: "focus", text: "Currently learning Next.js." });
  await store.settle();

  const plan = (await store.list(ada)).find((m) => m.type === "plan");
  assert.equal(await store.forget(ada, plan.id), true);
  assert.equal(await store.forget(ada, "not-a-real-id"), false);

  const { memories } = await store.recall(ada, "Can I take time off in December?");
  assert.equal(memories.some((m) => m.text.includes("December")), false);
  assert.equal((await store.list(ada)).length, 1);
});

test("a correction supersedes the memory it replaces", async () => {
  const store = newStore();
  await store.save(ada, { type: "focus", text: "Works on the frontend team." });
  await store.settle();
  const [old] = await store.list(ada);

  await store.save(ada, { type: "focus", text: "Moved to the backend team.", replaces: [old.id] });
  await store.settle();
  const texts = (await store.list(ada)).map((m) => m.text);
  assert.deepEqual(texts, ["Moved to the backend team."]);
});

test("employees cannot see or forget each other's memories", async () => {
  const store = newStore();
  await store.save(ada, { type: "preference", text: "Prefers short, bullet-point answers." });
  await store.settle();
  const [mine] = await store.list(ada);

  assert.equal((await store.list(tunde)).length, 0);
  assert.equal(await store.forget(tunde, mine.id), false);
  assert.equal((await store.list(ada)).length, 1);
});

test("HR tools are bound to the signed-in employee and take no identity input", async () => {
  const trace = { tools: [], actions: [] };
  const tools = buildTools(mockAdapter, await mockAdapter.resolveIdentity("demo-tunde"), trace);
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));

  const profile = await byName.get_my_profile.run({});
  assert.equal(profile.name, "Tunde Bello");
  for (const t of tools) {
    const props = Object.keys(z.toJSONSchema(t.schema).properties ?? {});
    assert.equal(props.some((p) => /user|pin|employee|id$/i.test(p)), false, `${t.name} takes an identity`);
  }

  await byName.draft_leave_request.run({ leave_type: "Annual", start_date: "2026-12-22", end_date: "2026-12-26" });
  assert.equal(trace.actions[0].type, "leave_request_draft");
  assert.deepEqual(trace.tools.map((t) => t.name), ["get_my_profile", "draft_leave_request"]);
});

test("API: auth, chat validation, memory endpoints", async () => {
  const store = newStore();
  const turns = [];
  const app = createApp({
    adapter: mockAdapter,
    store,
    runTurn: async (turn) => {
      turns.push(turn);
      return { reply: "ok" };
    },
  });
  const call = (path, { token = "demo-ada", method = "GET", body } = {}) =>
    app.request(path, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });

  assert.equal((await call("/health", { token: null })).status, 200);
  assert.equal((await call("/me", { token: null })).status, 401);
  assert.equal((await call("/me", { token: "demo-nobody" })).status, 401);
  assert.equal((await (await call("/me")).json()).name, "Ada Okafor");

  assert.equal((await call("/chat", { method: "POST", body: { messages: [] } })).status, 400);
  assert.equal(
    (await call("/chat", { method: "POST", body: { messages: [{ role: "system", content: "x" }] } })).status,
    400,
  );
  const chat = await call("/chat", {
    method: "POST",
    // An identity in the body must be ignored.
    body: { userId: "1002", memory: false, messages: [{ role: "user", content: "Hi" }] },
  });
  assert.equal(chat.status, 200);
  assert.equal(turns[0].identity.userId, "1001");
  assert.equal(turns[0].memoryEnabled, false);

  await store.save(turns[0].identity, { type: "goal", text: "Wants to move into a tech-lead role." });
  await store.settle();
  const { memories } = await (await call("/memories")).json();
  assert.equal(memories.length, 1);
  assert.equal((await (await call("/memories", { token: "demo-tunde" })).json()).memories.length, 0);
  assert.equal((await call(`/memories/${memories[0].id}`, { token: "demo-tunde", method: "DELETE" })).status, 404);
  assert.equal((await call(`/memories/${memories[0].id}`, { method: "DELETE" })).status, 200);
  assert.equal((await (await call("/memories")).json()).memories.length, 0);

  assert.equal((await call("/memory-settings", { method: "PUT", body: { paused: true } })).status, 200);
  assert.equal((await (await call("/me")).json()).memory_paused, true);
});

test("a chat turn recalls memory, runs HR tools as the employee, and saves what is worth keeping", async () => {
  const { runTurn } = await import("../src/agent.js");
  const store = newStore();
  const identity = await mockAdapter.resolveIdentity("demo-ada");
  await store.save(identity, { type: "preference", text: "Prefers short, bullet-point answers." });
  await store.settle();

  const seen = {};
  const llm = {
    async chatWithTools({ system, tools }) {
      seen.system = system;
      const balance = await tools.find((t) => t.name === "get_my_leave_balance").run({});
      return `You have ${balance.total_remaining_days} days left.`;
    },
    async json({ user }) {
      seen.extractInput = user;
      return {
        save: [
          { type: "plan", text: "Wants the week of 22 December off.", expires_in_days: 90, replaces: [] },
          { type: "context", text: "Has 35 leave days remaining.", expires_in_days: null, replaces: [] },
        ],
        forget: [],
      };
    },
  };
  const messages = [{ role: "user", content: "Can I take the week of 22 December off?" }];

  const turn = await runTurn({ llm, adapter: mockAdapter, store, identity, messages });
  assert.equal(turn.reply, "You have 35 days left.");
  assert.match(seen.system, /Prefers short, bullet-point answers/);
  assert.deepEqual(turn.hr.lookups, [{ name: "get_my_leave_balance", ok: true }]);
  // The plan is kept; the leave balance is an HR record and is blocked by policy.
  assert.deepEqual(turn.memory.events.map((e) => e.memory.text), ["Wants the week of 22 December off."]);

  const off = await runTurn({ llm, adapter: mockAdapter, store, identity, messages, memoryEnabled: false });
  assert.equal(off.memory.recalled.length, 0);
  assert.equal(off.memory.events.length, 0);
  assert.match(seen.system, /Memory is switched off/);
});

test("preferences are recalled for any question; goals and plans only when relevant", async () => {
  const store = new MemoryStore({
    client: MemWalMock.create(),
    index: openIndex(":memory:"),
    maxDistance: 0.05, // nothing passes the similarity filter, so only the always-on set can appear
    log: { error() {} },
  });
  await store.save(ada, { type: "preference", text: "Prefers short answers." });
  await store.save(ada, { type: "goal", text: "Wants to become a tech lead." });
  await store.save(ada, { type: "plan", text: "Wants the week of 22 December off." });
  await store.settle();

  await store.save(ada, { type: "open_thread", text: "Drafted a leave request; not yet submitted." });
  await store.settle();
  // Mid-conversation: only the preference shapes the answer.
  let { memories } = await store.recall(ada, "When is my next shift?");
  assert.deepEqual(memories.map((m) => m.type), ["preference"]);
  // First message of a conversation: the open thread is worth one follow-up.
  ({ memories } = await store.recall(ada, "When is my next shift?", { firstMessage: true }));
  assert.deepEqual(memories.map((m) => m.type).sort(), ["open_thread", "preference"]);
});

test("a memory forgotten while its upload is in flight never reappears", async () => {
  // Like the real relayer: the blob is searchable before the upload job reports done.
  const client = MemWalMock.create();
  let finishUpload;
  const uploadGate = new Promise((resolve) => { finishUpload = resolve; });
  const wait = client.waitForRememberJob.bind(client);
  client.waitForRememberJob = async (...args) => { await uploadGate; return wait(...args); };

  const store = new MemoryStore({ client, index: openIndex(":memory:"), maxDistance: 2, log: { error() {} } });
  const { memory } = await store.save(ada, { type: "plan", text: "Wants the week of 22 December off." });
  await new Promise((r) => setTimeout(r, 10)); // remember() accepted; blob now visible to recall

  assert.equal(await store.forget(ada, memory.id), true);
  assert.equal((await store.list(ada)).length, 0, "visible while uploading");
  assert.equal((await store.recall(ada, "December time off")).memories.length, 0);

  finishUpload();
  await store.settle();
  assert.equal((await store.list(ada)).length, 0, "visible after upload finished");
  assert.equal((await store.index.rows(store.namespace(ada)))[0].pending_text, null);
});

test("a drafted leave request becomes an open thread that later conversations recall", async () => {
  const { runTurn } = await import("../src/agent.js");
  const store = newStore();
  const identity = await mockAdapter.resolveIdentity("demo-ada");
  const systems = [];
  const llm = {
    async chatWithTools({ system, tools }) {
      systems.push(system);
      if (systems.length === 1) {
        await tools
          .find((t) => t.name === "draft_leave_request")
          .run({ leave_type: "Annual", start_date: "2026-12-21", end_date: "2026-12-25" });
      }
      return "ok";
    },
    async json() {
      return { save: [], forget: [] };
    },
  };

  const first = await runTurn({
    llm, adapter: mockAdapter, store, identity,
    messages: [{ role: "user", content: "Draft leave for the week of 21 December" }],
  });
  assert.deepEqual(first.memory.events.map((e) => [e.memory.type, e.memory.text]), [
    ["open_thread", "Drafted a leave request (Annual) for 2026-12-21 to 2026-12-25; not yet submitted."],
  ]);
  // Nothing known yet on a first message → the assistant is told to introduce itself.
  assert.match(systems[0], /first message of a new conversation/);
  assert.match(systems[0], /invite them to tell you how they like answers/);
  await store.settle();

  // A new conversation about something unrelated still sees the open thread, and no second introduction.
  const second = await runTurn({
    llm, adapter: mockAdapter, store, identity,
    messages: [{ role: "user", content: "When is my next shift?" }],
  });
  assert.equal(second.memory.recalled.some((m) => m.type === "open_thread"), true);
  assert.match(systems[1], /\[open_thread\] Drafted a leave request/);
  assert.doesNotMatch(systems[1], /invite them to tell you/);
});

test("the introduction is offered once per employee, even if they never share anything", async () => {
  const { runTurn } = await import("../src/agent.js");
  const store = newStore();
  const identity = await mockAdapter.resolveIdentity("demo-ngozi");
  const systems = [];
  const llm = {
    async chatWithTools({ system }) { systems.push(system); return "ok"; },
    async json() { return { save: [], forget: [] }; },
  };
  const ask = () => runTurn({ llm, adapter: mockAdapter, store, identity, messages: [{ role: "user", content: "Hello" }] });
  await ask();
  await ask();
  assert.match(systems[0], /invite them to tell you/);
  assert.doesNotMatch(systems[1], /invite them to tell you/);
});

test("wins are recalled for appraisal questions, and everything for 'what do you remember'", async () => {
  const store = new MemoryStore({
    client: MemWalMock.create(),
    index: openIndex(":memory:"),
    maxDistance: 0.05, // nothing passes the similarity filter
    log: { error() {} },
  });
  await store.save(ada, { type: "achievement", text: "Finished reorganising the depot loading bays." });
  await store.save(ada, { type: "knows", text: "Already knows how to submit a leave request in the app." });
  await store.settle();
  const types = async (q) => (await store.recall(ada, q)).memories.map((m) => m.type).sort();

  assert.deepEqual(await types("When is my next shift?"), []);
  assert.deepEqual(await types("My appraisal is coming up, what have I achieved?"), ["achievement"]);
  assert.deepEqual(await types("What do you remember about me?"), ["achievement", "knows"]);
});

test("wins and already-explained how-tos are storable; pay and role claims still are not", () => {
  assert.equal(screenMemory({ type: "achievement", text: "Shipped the new payroll export feature." }).ok, true);
  assert.equal(screenMemory({ type: "knows", text: "Already knows how to submit a leave request in the app." }).ok, true);
  assert.equal(screenMemory({ type: "achievement", text: "Was promoted to team lead." }).ok, false);
  assert.equal(screenMemory({ type: "achievement", text: "Got a salary raise this quarter." }).ok, false);
});

test("uploads cut off by a restart are resumed, once", async () => {
  const index = openIndex(":memory:");
  const client = MemWalMock.create();
  // First process: the upload never completes before it is stopped.
  const hung = { ...client, remember: () => new Promise(() => {}), recall: client.recall.bind(client) };
  const before = new MemoryStore({ client: hung, index, maxDistance: 2, log: { error() {} } });
  await before.save(ada, { type: "goal", text: "Wants to become a tech lead." });

  // Second process, same index: the upload is picked up and finished.
  const after = new MemoryStore({ client, index, maxDistance: 2, log: { error() {} } });
  assert.equal(await after.resumeUploads(), 1);
  await after.settle();
  const list = await after.list(ada);
  assert.deepEqual(list.map((m) => [m.status, m.text]), [["active", "Wants to become a tech lead."]]);
  assert.equal(await after.resumeUploads(), 0);
});
