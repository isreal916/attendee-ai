import { Hono } from "hono";
import { cors } from "hono/cors";

const MAX_MESSAGES = 30;
const MAX_CHARS = 4000;
const CHATS_PER_MINUTE = 20;

/** Validate the client-supplied transcript: plain text turns, ending with the employee. */
function parseMessages(input) {
  if (!Array.isArray(input) || input.length === 0) return null;
  const messages = input.slice(-MAX_MESSAGES).map((m) => ({ role: m?.role, content: m?.content }));
  for (const m of messages) {
    if (m.role !== "user" && m.role !== "assistant") return null;
    if (typeof m.content !== "string" || !m.content.trim() || m.content.length > MAX_CHARS) return null;
  }
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages.at(-1).role !== "user") return null;
  return messages;
}

/**
 * @param {object} deps
 * @param {object} deps.adapter   HR adapter (src/hr)
 * @param {import("./memory/store.js").MemoryStore} deps.store
 * @param {(p: object) => Promise<object>} deps.runTurn  chat turn (src/agent.js), with its dependencies bound
 */
export function createApp({ adapter, store, runTurn, corsOrigins = [] }) {
  const app = new Hono();
  const chatHits = new Map();

  app.use("*", cors({ origin: corsOrigins, allowHeaders: ["Authorization", "Content-Type"] }));

  app.get("/health", (c) => c.json({ ok: true, hr: adapter.name }));

  // Everything below needs a signed-in employee. Identity comes only from the
  // verified token — never from the request body or the model.
  app.use("*", async (c, next) => {
    const token = c.req.header("Authorization")?.match(/^Bearer (.+)$/)?.[1];
    if (!token) console.warn("sign-in rejected: the request carried no Authorization bearer token");
    const identity = token ? await adapter.resolveIdentity(token) : null;
    if (!identity) return c.json({ error: "Not signed in." }, 401);
    c.set("identity", identity);
    await next();
  });

  app.get("/me", (c) => {
    const { name, companyName } = c.get("identity");
    return c.json({ name, company: companyName, memory_paused: store.isPaused(c.get("identity")) });
  });

  app.post("/chat", async (c) => {
    const identity = c.get("identity");

    const key = store.namespace(identity);
    const now = Date.now();
    const recent = (chatHits.get(key) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= CHATS_PER_MINUTE) return c.json({ error: "Too many messages — give it a minute." }, 429);
    chatHits.set(key, [...recent, now]);

    const body = await c.req.json().catch(() => null);
    const messages = parseMessages(body?.messages);
    if (!messages) return c.json({ error: "Send { messages: [{ role, content }] } ending with a user message." }, 400);

    try {
      const result = await runTurn({ identity, messages, memoryEnabled: body.memory !== false });
      return c.json(result);
    } catch (err) {
      console.error(`chat failed: ${err?.message ?? err}`);
      return c.json({ error: "Atty couldn't answer just now. Please try again." }, 502);
    }
  });

  app.get("/memories", async (c) => {
    try {
      return c.json({ memories: await store.list(c.get("identity")) });
    } catch (err) {
      console.error(`memory list failed: ${err?.message ?? err}`);
      return c.json({ error: "Memory is unavailable right now." }, 502);
    }
  });

  app.delete("/memories/:id", async (c) => {
    const forgotten = await store.forget(c.get("identity"), c.req.param("id"));
    return forgotten ? c.json({ forgotten: true }) : c.json({ error: "No such memory." }, 404);
  });

  app.delete("/memories", async (c) => c.json({ forgotten: await store.forgetAll(c.get("identity")) }));

  app.put("/memory-settings", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (typeof body?.paused !== "boolean") return c.json({ error: "Send { paused: true | false }." }, 400);
    store.setPaused(c.get("identity"), body.paused);
    return c.json({ paused: body.paused });
  });

  return app;
}
