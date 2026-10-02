import { randomUUID } from "node:crypto";
import { expiryFor, formatMemory, MEMORY_TYPES, parseMemory, screenMemory } from "./policy.js";

// Recall picks the smallest set of memories that should change this reply:
//   - preferences, always (they shape every answer);
//   - open threads, on the first message of a conversation (worth one follow-up);
//   - wins and goals, when the employee is preparing for a review;
//   - anything else only when it is similar enough to the message.
const POOL_QUERY = "about this employee: preferences, goals, focus, plans, unfinished things, wins";
const POOL_LIMIT = 40;
const POOL_TTL_MS = 90_000;
const MAX_PER_TURN = 6;
const MAX_FOR_REVIEW = 10;
const RECENT_MS = 15 * 60_000;
const ASKS_ABOUT_REVIEW = /apprais|perform|review|self[- ]?assess|achiev|accomplish|\bwins?\b|proud|promot/i;
// Open-ended guidance ("what should I work on?", "how can I grow?") is when goals and current
// focus matter most, yet it rarely shares words with them, so similarity alone misses them.
const ASKS_FOR_GUIDANCE =
  /\b(what|which|how)\b.{0,40}\b(should|could|would|can)\b.{0,40}\b(work on|focus|learn|improve|grow|do|study|practi[cs]e|prioriti[sz]e)|\b(work on|focus on|learn next|improve|grow|career|develop|skills?|free time|spare time|plan my|priorit|next step|advice)\b/i;
// "Anything I still need to do?" is a question about open threads and plans, but it shares no
// words with "drafted a leave request", so similarity alone misses them.
const ASKS_ABOUT_PENDING =
  /\b(still|left to|pending|outstanding|unfinished|forg[eo]t(ten|ting)?|to-?do|take care of|follow[- ]?up|catch up|loose ends|need to (do|finish|submit|handle|sort))\b/i;
const ASKS_WHAT_IS_REMEMBERED = /\b(remember|know) about me\b|what do you (remember|know)/i;
const LIST_QUERY = "everything known about this employee";
// A recall that fails is tried once more after this pause (the relayer's first
// call after a restart can take 7–10s while it sets up its Seal session).
const RECALL_RETRY_DELAY_MS = 500;
// If Walrus cannot be reached, the last good copy is used for this long.
const STALE_FOR_MS = 30 * 60_000;

const typeOf = (hit) => parseMemory(hit.text).type;

/**
 * Per-employee long-term memory on Walrus Memory (MemWal).
 *
 * - One namespace per employee; the namespace comes from the verified identity.
 * - Writes are screened by policy, recorded in the index at once and uploaded
 *   to Walrus in the background (a save takes ~30s), so chat never waits.
 *   A failed upload is retried once, then kept as "failed" with its text so
 *   the employee can see it and retry.
 * - The relayer cannot forget a single memory, so forgotten/superseded blobs
 *   are tombstoned in the index (SQLite or Postgres) and filtered out of every recall.
 */
export class MemoryStore {
  constructor({
    client,
    index,
    maxDistance = 0.68,
    rememberTimeoutMs = 300_000,
    retryDelayMs = 15_000,
    log = console,
  }) {
    this.client = client;
    this.index = index;
    this.maxDistance = maxDistance;
    this.rememberTimeoutMs = rememberTimeoutMs;
    this.retryDelayMs = retryDelayMs;
    this.log = log;
    /** In-flight uploads, so tests and shutdown can await them. */
    this.inFlight = new Set();
    /** Short-lived cache of each employee's memory pool (the always-on candidates). */
    this.pools = new Map();
    /** Last good pool and list per employee, used only when Walrus cannot be reached. */
    this.lastPool = new Map();
    this.lastList = new Map();
  }

  /** A relayer recall, tried twice. */
  async #recall(params) {
    try {
      return await this.client.recall(params);
    } catch {
      await new Promise((r) => setTimeout(r, RECALL_RETRY_DELAY_MS));
      return this.client.recall(params);
    }
  }

  /** One recall against the relayer, timed, with the error if it fails. For /health/memory. */
  async checkRelayer() {
    const t = Date.now();
    try {
      await this.client.recall({ query: "health check", namespace: "attendee:warmup", limit: 1 });
      return { ok: true, ms: Date.now() - t };
    } catch (err) {
      return { ok: false, ms: Date.now() - t, status: err?.status ?? null, error: String(err?.message ?? err).slice(0, 300) };
    }
  }

  /**
   * Make one cheap recall so the relayer session is set up before an employee
   * needs it, and keep it warm. Never throws.
   */
  async warmUp() {
    const t = Date.now();
    try {
      await this.client.recall({ query: "warm up", namespace: "attendee:warmup", limit: 1 });
      return Date.now() - t;
    } catch (err) {
      this.log.error(`memory warm-up failed: ${err?.message ?? err}`);
      return null;
    }
  }

  namespace(identity) {
    return `attendee:${identity.companyId}:${identity.userId}`;
  }

  isPaused(identity) {
    return this.index.isPaused(this.namespace(identity));
  }

  setPaused(identity, paused) {
    return this.index.setPaused(this.namespace(identity), paused);
  }

  /** How many memories are stored or uploading — for the first-time experience and the UI. */
  countLive(identity) {
    return this.index.countLive(this.namespace(identity));
  }

  /** Record a usage count for the tester report. Never content; never fails the caller. */
  track(identity, kind, n = 1) {
    if (n <= 0) return Promise.resolve();
    return this.index.addEvent(this.namespace(identity), kind, n).catch((err) => {
      this.log.error(`usage tracking failed: ${err?.message ?? err}`);
    });
  }

  /**
   * Save one memory. Resolves once it is recorded in the index; the Walrus
   * upload continues in the background.
   * @returns {Promise<{ saved: true, memory: object } | { saved: false, reason: string }>}
   */
  async save(identity, { type, text, expiresInDays = null, source = "extracted", replaces = [] }) {
    const screened = screenMemory({ type, text });
    if (!screened.ok) return { saved: false, reason: screened.reason };

    const ns = this.namespace(identity);
    const id = randomUUID();
    const createdAt = Date.now();
    const expiresAt = expiryFor(type, expiresInDays, createdAt);
    await this.index.insert({
      id, ns, type, status: "saving", pendingText: screened.text, source, createdAt, expiresAt,
    });
    for (const old of replaces) {
      if (!(await this.index.setStatus(ns, old, "superseded"))) await this.#tombstone(ns, old, "superseded");
    }
    this.pools.delete(ns);

    this.#startUpload(id, ns, formatMemory(type, screened.text));

    return {
      saved: true,
      memory: { id, type, text: screened.text, status: "saving", source, createdAt, expiresAt },
    };
  }

  /** Replace a memory's wording. The old one stops being recalled; the new one keeps its type. */
  async edit(identity, id, text) {
    const current = (await this.list(identity)).find((m) => m.id === id);
    if (!current) return { saved: false, reason: "No such memory." };
    const type = MEMORY_TYPES[current.type]?.retired ? "preference" : current.type;
    return this.save(identity, { type, text, source: "edited", replaces: [id] });
  }

  /** Try a failed save again. Resolves false if there is no failed memory with that id. */
  async retry(identity, id) {
    const ns = this.namespace(identity);
    if (!(await this.index.markRetrying(ns, id))) return false;
    const row = await this.index.row(ns, id);
    this.#startUpload(row.id, ns, formatMemory(row.type, row.pending_text));
    return true;
  }

  /**
   * Re-send uploads that were cut off by a restart or deploy. The memory id is
   * the idempotency key, so one that did reach the relayer is not stored twice.
   * @returns {Promise<number>} how many uploads were resumed
   */
  async resumeUploads() {
    const rows = await this.index.unfinishedUploads();
    for (const row of rows) this.#startUpload(row.id, row.ns, formatMemory(row.type, row.pending_text));
    return rows.length;
  }

  #startUpload(id, ns, text) {
    const upload = this.#upload(id, ns, text).finally(() => this.inFlight.delete(upload));
    this.inFlight.add(upload);
  }

  async #upload(id, ns, text, attempt = 1) {
    try {
      const job = await this.client.remember(text, ns, { idempotencyKey: id });
      const done = await this.client.waitForRememberJob(job.job_id, { timeoutMs: this.rememberTimeoutMs });
      await this.index.markStored(id, done.blob_id);
      this.pools.delete(ns);
    } catch (err) {
      if (attempt < 2) {
        this.log.error(`memory upload failed (${id}), retrying: ${err?.message ?? err}`);
        await new Promise((r) => setTimeout(r, this.retryDelayMs));
        return this.#upload(id, ns, text, attempt + 1);
      }
      this.log.error(`memory upload failed (${id}): ${err?.message ?? err}`);
      await this.index.markFailed(id).catch(() => {});
      await this.index.addEvent(ns, "save_failed", 1).catch(() => {});
    }
  }

  /** The employee's memory pool, cached briefly: the candidates for always-on recall. */
  #pool(ns) {
    const cached = this.pools.get(ns);
    if (cached && Date.now() - cached.at < POOL_TTL_MS) return cached.promise;
    const promise = this.#recall({ query: POOL_QUERY, namespace: ns, limit: POOL_LIMIT }).then(
      (result) => {
        this.lastPool.set(ns, { at: Date.now(), result });
        return result;
      },
      (err) => {
        this.pools.delete(ns);
        const last = this.lastPool.get(ns);
        if (last && Date.now() - last.at < STALE_FOR_MS) return last.result;
        throw err;
      },
    );
    this.pools.set(ns, { at: Date.now(), promise });
    return promise;
  }

  /**
   * The memories that should shape the reply to this message.
   * @returns {Promise<{ memories: object[], degraded: boolean }>}
   */
  async recall(identity, query, { firstMessage = false } = {}) {
    const ns = this.namespace(identity);
    const [relevant, pool] = await Promise.allSettled([
      this.#recall({ query, namespace: ns, limit: 10, maxDistance: this.maxDistance }),
      this.#pool(ns),
    ]);
    const degraded = relevant.status === "rejected" || pool.status === "rejected";
    if (degraded) this.log.error("memory recall degraded: relayer request failed");
    const relevantHits = relevant.status === "fulfilled" ? relevant.value.results : [];
    const poolHits = pool.status === "fulfilled" ? pool.value.results : [];

    if (ASKS_WHAT_IS_REMEMBERED.test(query)) {
      const { fromHits, pending } = await this.#visible(ns, poolHits, { pending: "all" });
      return { memories: [...pending, ...fromHits], degraded };
    }

    const review = ASKS_ABOUT_REVIEW.test(query);
    const guidance = ASKS_FOR_GUIDANCE.test(query);
    const openThreads = firstMessage || ASKS_ABOUT_PENDING.test(query);
    const ofType = (...types) => poolHits.filter((h) => types.includes(typeOf(h)));
    const ordered = [
      ...ofType("preference"),
      ...(openThreads ? ofType("open_thread") : []),
      ...(openThreads && !firstMessage ? ofType("plan") : []),
      ...(review ? ofType("achievement", "goal") : []),
      ...(guidance ? ofType("goal", "focus") : []),
      ...[...relevantHits].sort((a, b) => a.distance - b.distance),
    ];
    const { fromHits, pending } = await this.#visible(ns, ordered, {
      pending: (row) =>
        row.type === "preference" ||
        (openThreads && row.type === "open_thread") ||
        Date.now() - row.created_at < RECENT_MS,
    });
    const limit = review ? MAX_FOR_REVIEW : MAX_PER_TURN;
    // Preferences first (they shape every answer), then what was just said, then the rest by relevance.
    const prefs = fromHits.filter((m) => m.type === "preference");
    const rest = fromHits.filter((m) => m.type !== "preference");
    return { memories: [...prefs, ...pending, ...rest].slice(0, limit), degraded };
  }

  /** True once, for an employee this service has never saved anything for and never greeted. */
  async needsIntroduction(identity) {
    const ns = this.namespace(identity);
    return !(await this.index.hasAny(ns)) && !(await this.index.wasIntroduced(ns));
  }

  markIntroduced(identity) {
    return this.index.markIntroduced(this.namespace(identity));
  }

  /** Everything held for this employee, including saves that failed — for the memory page. */
  async list(identity) {
    const ns = this.namespace(identity);
    const { results } = await this.#recall({ query: LIST_QUERY, namespace: ns, limit: 100 });
    this.lastList.set(ns, { at: Date.now(), results });
    return this.#listFrom(ns, results);
  }

  /**
   * The list for the memory page. If Walrus cannot be reached, falls back to
   * the last good copy (re-filtered against the index, so anything forgotten
   * since stays hidden) and says so.
   * @returns {Promise<{ memories: object[], stale: boolean, asOf?: number }>}
   */
  async listForDisplay(identity) {
    const ns = this.namespace(identity);
    try {
      return { memories: await this.list(identity), stale: false };
    } catch (err) {
      const last = this.lastList.get(ns);
      if (!last || Date.now() - last.at > STALE_FOR_MS) throw err;
      this.log.error(`memory list served from cache: ${err?.message ?? err}`);
      return { memories: await this.#listFrom(ns, last.results), stale: true, asOf: last.at };
    }
  }

  async #listFrom(ns, results) {
    const { fromHits, pending } = await this.#visible(ns, results, { pending: "all", includeFailed: true });
    return [...pending, ...fromHits].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }

  /** Hide one memory from every future recall. Returns false if it is unknown. */
  async forget(identity, id) {
    const ns = this.namespace(identity);
    this.pools.delete(ns);
    if (await this.index.setStatus(ns, id, "forgotten")) return true;
    // Not in the index (e.g. index was rebuilt): only tombstone blobs that really are this employee's.
    const visible = await this.list(identity);
    if (!visible.some((m) => m.id === id)) return false;
    await this.#tombstone(ns, id, "forgotten");
    return true;
  }

  async forgetAll(identity) {
    const all = await this.list(identity);
    for (const m of all) await this.forget(identity, m.id);
    return all.length;
  }

  #tombstone(ns, blobId, status) {
    return this.index.insert({ id: randomUUID(), ns, blobId, type: "context", status, createdAt: Date.now() });
  }

  /**
   * Merge relayer hits with the index: drop hidden and expired ones (keeping
   * hit order), and pick the local rows that stand in for uploads in flight.
   * @param {object} opts
   * @param {"all" | ((row) => boolean)} opts.pending  which in-flight saves to include
   * @param {boolean} [opts.includeFailed]  also return failed saves (memory page only — never recalled)
   */
  async #visible(ns, hits, { pending, includeFailed = false }) {
    const now = Date.now();
    const rows = await this.index.rows(ns);
    const byBlob = new Map(rows.filter((r) => r.blob_id).map((r) => [r.blob_id, r]));
    // The relayer can return a blob before its upload job reports done, i.e.
    // before the index knows its blob id. Such hits are matched by text and
    // skipped: a "saving" row already stands in for it, and a row forgotten or
    // superseded mid-upload must stay hidden.
    const uploading = new Set(
      rows.filter((r) => !r.blob_id && r.pending_text).map((r) => formatMemory(r.type, r.pending_text)),
    );

    const seen = new Set();
    const fromHits = [];
    for (const hit of hits) {
      if (seen.has(hit.blob_id) || uploading.has(hit.text)) continue;
      seen.add(hit.blob_id);
      const row = byBlob.get(hit.blob_id);
      if (row && row.status !== "active") continue;
      if (row?.expires_at && row.expires_at < now) continue;
      const { type, text } = parseMemory(hit.text);
      fromHits.push({
        id: hit.blob_id,
        // The id the memory was saved under, so a client can follow a save from "saving" to "stored".
        ref: row?.id ?? null,
        type,
        text,
        status: "active",
        source: row?.source ?? null,
        createdAt: row?.created_at ?? (hit.created_at ? Date.parse(hit.created_at) : null),
        expiresAt: row?.expires_at ?? null,
      });
    }

    const pendingRows = rows.filter(
      (r) =>
        r.pending_text &&
        (r.status === "saving" || (includeFailed && r.status === "failed")) &&
        (pending === "all" || pending(r)),
    );
    return {
      fromHits,
      pending: pendingRows.map((r) => ({
        id: r.id,
        ref: r.id,
        type: r.type,
        text: r.pending_text,
        status: r.status,
        source: r.source,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
      })),
    };
  }

  /** Wait for background uploads (tests, graceful shutdown). */
  async settle() {
    await Promise.allSettled([...this.inFlight]);
  }
}
