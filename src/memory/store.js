import { randomUUID } from "node:crypto";
import { expiryFor, formatMemory, parseMemory, screenMemory } from "./policy.js";

// Preferences, goals and current focus apply to every answer, and open threads
// are worth following up whatever the question, so these are always included —
// chosen by type, not by how similar they are to the question.
const PROFILE_QUERY = "answer style preferences, career goals and current focus";
const PROFILE_TYPES = new Set(["preference", "goal", "focus", "open_thread"]);
const PROFILE_LIMIT = 10;
// Some questions are about a whole category of memory, whatever words they use.
const ASKS_ABOUT_WINS = /apprais|perform|review|achiev|accomplish|\bwins?\b|proud|promot/i;
const ASKS_WHAT_IS_REMEMBERED = /\b(remember|know) about me\b|what do you (remember|know)/i;
const LIST_QUERY = "everything known about this employee";

/**
 * Per-employee long-term memory on Walrus Memory (MemWal).
 *
 * - One namespace per employee; the namespace comes from the verified identity.
 * - Writes are screened by policy, acknowledged immediately and uploaded in the
 *   background (a save takes ~30s on the relayer), so chat never waits.
 * - The relayer cannot forget a single memory, so forgotten/superseded blobs
 *   are tombstoned in the index (SQLite or Postgres) and filtered out of every recall.
 */
export class MemoryStore {
  constructor({ client, index, maxDistance = 0.75, rememberTimeoutMs = 300_000, log = console }) {
    this.client = client;
    this.index = index;
    this.maxDistance = maxDistance;
    this.rememberTimeoutMs = rememberTimeoutMs;
    this.log = log;
    /** In-flight uploads, so tests and shutdown can await them. */
    this.inFlight = new Set();
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

    this.#startUpload(id, ns, formatMemory(type, screened.text));

    return {
      saved: true,
      memory: { id, type, text: screened.text, status: "saving", createdAt, expiresAt },
    };
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

  async #upload(id, ns, text) {
    try {
      const job = await this.client.remember(text, ns, { idempotencyKey: id });
      const done = await this.client.waitForRememberJob(job.job_id, { timeoutMs: this.rememberTimeoutMs });
      await this.index.markStored(id, done.blob_id);
    } catch (err) {
      this.log.error(`memory upload failed (${id}): ${err?.message ?? err}`);
      await this.index.markFailed(id).catch(() => {});
    }
  }

  /** Memories relevant to this message, plus the always-on profile set. */
  async recall(identity, query) {
    const ns = this.namespace(identity);
    const [relevant, profile] = await Promise.allSettled([
      this.client.recall({ query, namespace: ns, limit: 10, maxDistance: this.maxDistance }),
      this.client.recall({ query: PROFILE_QUERY, namespace: ns, limit: 30 }),
    ]);
    const wanted = (type) =>
      ASKS_WHAT_IS_REMEMBERED.test(query) ||
      PROFILE_TYPES.has(type) ||
      (type === "achievement" && ASKS_ABOUT_WINS.test(query));
    const profileHits =
      profile.status === "fulfilled"
        ? profile.value.results.filter((h) => wanted(parseMemory(h.text).type)).slice(0, PROFILE_LIMIT)
        : [];
    const hits = [...(relevant.status === "fulfilled" ? relevant.value.results : []), ...profileHits];
    const degraded = relevant.status === "rejected" || profile.status === "rejected";
    if (degraded) this.log.error("memory recall degraded: relayer request failed");
    return { memories: await this.#visible(ns, hits), degraded };
  }

  /** True once, for an employee this service has never saved anything for and never greeted. */
  async needsIntroduction(identity) {
    const ns = this.namespace(identity);
    return !(await this.index.hasAny(ns)) && !(await this.index.wasIntroduced(ns));
  }

  markIntroduced(identity) {
    return this.index.markIntroduced(this.namespace(identity));
  }

  /** Everything held for this employee — for the "What Attie remembers" page. */
  async list(identity) {
    const ns = this.namespace(identity);
    const { results } = await this.client.recall({ query: LIST_QUERY, namespace: ns, limit: 100 });
    const visible = await this.#visible(ns, results);
    return visible.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }

  /** Hide one memory from every future recall. Returns false if it is unknown. */
  async forget(identity, id) {
    const ns = this.namespace(identity);
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

  /** Merge relayer hits with the index: drop hidden/expired, add uploads still in flight. */
  async #visible(ns, hits) {
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
    const out = new Map();

    for (const hit of hits) {
      if (uploading.has(hit.text)) continue;
      const row = byBlob.get(hit.blob_id);
      if (row && row.status !== "active") continue;
      if (row?.expires_at && row.expires_at < now) continue;
      const { type, text } = parseMemory(hit.text);
      out.set(hit.blob_id, {
        id: hit.blob_id,
        type,
        text,
        status: "active",
        createdAt: row?.created_at ?? (hit.created_at ? Date.parse(hit.created_at) : null),
        expiresAt: row?.expires_at ?? null,
      });
    }
    for (const row of rows) {
      if (row.status !== "saving" || !row.pending_text) continue;
      out.set(row.id, {
        id: row.id, type: row.type, text: row.pending_text, status: "saving",
        createdAt: row.created_at, expiresAt: row.expires_at,
      });
    }
    return [...out.values()];
  }

  /** Wait for background uploads (tests, graceful shutdown). */
  async settle() {
    await Promise.allSettled([...this.inFlight]);
  }
}
