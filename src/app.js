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
export function createApp({ adapter, store, runTurn, corsOrigins = [], status = {}, checkMemory }) {
  const app = new Hono();
  const chatHits = new Map();

  app.use("*", cors({ origin: corsOrigins, allowHeaders: ["Authorization", "Content-Type"] }));

  // `status` is non-secret configuration (which backends are in use), to make a deployment checkable.
  app.get("/health", (c) => c.json({ ok: true, hr: adapter.name, ...status }));

  // One real recall against the relayer, to tell "memory is slow" from "memory is misconfigured".
  // Limited to one check a minute: each costs a relayer request.
  let lastCheck = null;
  app.get("/health/memory", async (c) => {
    if (!checkMemory) return c.json({ ok: false, error: "not available" }, 404);
    if (!lastCheck || Date.now() - lastCheck.at > 60_000) lastCheck = { at: Date.now(), result: await checkMemory() };
    return c.json(lastCheck.result, lastCheck.result.ok ? 200 : 503);
  });

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

  app.get("/me", async (c) => {
    const identity = c.get("identity");
    const [paused, count] = await Promise.all([store.isPaused(identity), store.countLive(identity)]);
    return c.json({ name: identity.name, company: identity.companyName, memory_paused: paused, memory_count: count });
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
      const result = await runTurn({
        identity,
        messages,
        memoryEnabled: body.memory !== false,
        compare: body.compare === true,
      });
      return c.json(result);
    } catch (err) {
      console.error(`chat failed: ${err?.message ?? err}`);
      return c.json({ error: "Atty couldn't answer just now. Please try again." }, 502);
    }
  });

  app.get("/memories", async (c) => {
    try {
      return c.json(await store.listForDisplay(c.get("identity")));
    } catch (err) {
      console.error(`memory list failed: ${err?.message ?? err}`);
      return c.json({ error: "Memory storage is slow to respond. Try again in a moment." }, 502);
    }
  });

  app.delete("/memories/:id", async (c) => {
    const identity = c.get("identity");
    const forgotten = await store.forget(identity, c.req.param("id"));
    if (!forgotten) return c.json({ error: "No such memory." }, 404);
    await store.track(identity, "memories_forgotten");
    return c.json({ forgotten: true });
  });

  app.delete("/memories", async (c) => {
    const identity = c.get("identity");
    const forgotten = await store.forgetAll(identity);
    await store.track(identity, "memories_forgotten", forgotten);
    return c.json({ forgotten });
  });

  // Correct a memory's wording: the old one stops being recalled, the new one replaces it.
  app.put("/memories/:id", async (c) => {
    const identity = c.get("identity");
    const body = await c.req.json().catch(() => null);
    if (typeof body?.text !== "string") return c.json({ error: "Send { text }." }, 400);
    const result = await store.edit(identity, c.req.param("id"), body.text);
    if (!result.saved) return c.json({ error: result.reason }, result.reason === "No such memory." ? 404 : 400);
    await store.track(identity, "memories_edited");
    return c.json({ memory: result.memory });
  });

  // Try a failed save again.
  app.post("/memories/:id/retry", async (c) => {
    const retried = await store.retry(c.get("identity"), c.req.param("id"));
    return retried ? c.json({ retrying: true }) : c.json({ error: "Nothing to retry." }, 404);
  });

  // "This helped" on a reply — a count for the tester report, nothing else is stored.
  app.post("/feedback", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (typeof body?.helpful !== "boolean") return c.json({ error: "Send { helpful: true | false }." }, 400);
    await store.track(c.get("identity"), body.helpful ? "helpful" : "not_helpful");
    return c.json({ recorded: true });
  });

  app.put("/memory-settings", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (typeof body?.paused !== "boolean") return c.json({ error: "Send { paused: true | false }." }, 400);
    await store.setPaused(c.get("identity"), body.paused);
    return c.json({ paused: body.paused });
  });

  return app;
}
