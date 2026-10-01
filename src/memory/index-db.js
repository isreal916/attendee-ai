import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * The index that sits beside Walrus Memory. Walrus holds the memory text;
 * the index holds what the relayer cannot: per-memory status (forgotten,
 * superseded), expiry, and the text of a memory only while its Walrus upload
 * is still in flight (pending_text is cleared once the blob is stored).
 *
 * Two interchangeable backends with the same async interface:
 *   - this file: a local SQLite file, for development and tests
 *   - index-pg.js: Postgres, for hosts without a persistent disk
 *
 * Rows use these columns: id, ns, blob_id, type, status, pending_text,
 * source, created_at (ms), expires_at (ms or null).
 * Status is one of: saving | active | forgotten | superseded | failed.
 */
export function openIndex(path) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      ns TEXT NOT NULL,
      blob_id TEXT,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      pending_text TEXT,
      source TEXT,
      created_at INTEGER NOT NULL,
      expires_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS memories_ns ON memories (ns, status);
    CREATE INDEX IF NOT EXISTS memories_blob ON memories (blob_id);
    CREATE TABLE IF NOT EXISTS settings (ns TEXT PRIMARY KEY, paused INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS introductions (ns TEXT PRIMARY KEY, at INTEGER NOT NULL);
    -- Usage counts for the tester report. Counts and timestamps only, never conversation content.
    CREATE TABLE IF NOT EXISTS events (ns TEXT NOT NULL, kind TEXT NOT NULL, n INTEGER NOT NULL, at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS events_ns ON events (ns, kind);
  `);

  const q = {
    insert: db.prepare(
      "INSERT INTO memories (id, ns, blob_id, type, status, pending_text, source, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ),
    stored: db.prepare(
      // Keep 'forgotten' if the employee forgot it while it was still uploading.
      "UPDATE memories SET blob_id = ?, pending_text = NULL, status = CASE WHEN status = 'saving' THEN 'active' ELSE status END WHERE id = ?",
    ),
    // A failed upload of a still-wanted memory keeps its text; one that was forgotten meanwhile drops it.
    failed: db.prepare(
      "UPDATE memories SET pending_text = CASE WHEN status = 'saving' THEN pending_text ELSE NULL END, status = CASE WHEN status = 'saving' THEN 'failed' ELSE status END WHERE id = ?",
    ),
    // pending_text is kept until the upload finishes: it is how a forgotten memory is
    // recognised if the relayer returns its blob before we have learned the blob id.
    setStatus: db.prepare("UPDATE memories SET status = ? WHERE ns = ? AND (id = ? OR blob_id = ?)"),
    byNs: db.prepare("SELECT * FROM memories WHERE ns = ?"),
    one: db.prepare("SELECT * FROM memories WHERE ns = ? AND (id = ? OR blob_id = ?)"),
    retrying: db.prepare("UPDATE memories SET status = 'saving' WHERE ns = ? AND id = ? AND status = 'failed' AND pending_text IS NOT NULL"),
    live: db.prepare("SELECT COUNT(*) AS n FROM memories WHERE ns = ? AND status IN ('active', 'saving')"),
    addEvent: db.prepare("INSERT INTO events (ns, kind, n, at) VALUES (?, ?, ?, ?)"),
    usage: db.prepare(
      "SELECT ns, kind, SUM(n) AS total, COUNT(DISTINCT date(at / 1000, 'unixepoch')) AS days, MIN(at) AS first, MAX(at) AS last FROM events GROUP BY ns, kind",
    ),
    statusCounts: db.prepare("SELECT ns, status, COUNT(*) AS n FROM memories GROUP BY ns, status"),
    unfinished: db.prepare("SELECT * FROM memories WHERE status = 'saving' AND pending_text IS NOT NULL"),
    forgotten: db.prepare("SELECT ns, blob_id FROM memories WHERE status = 'forgotten' AND blob_id IS NOT NULL"),
    count: db.prepare("SELECT COUNT(*) AS n FROM memories WHERE ns = ?"),
    introduced: db.prepare("SELECT 1 FROM introductions WHERE ns = ?"),
    setIntroduced: db.prepare("INSERT OR IGNORE INTO introductions (ns, at) VALUES (?, ?)"),
    paused: db.prepare("SELECT paused FROM settings WHERE ns = ?"),
    setPaused: db.prepare(
      "INSERT INTO settings (ns, paused) VALUES (?, ?) ON CONFLICT(ns) DO UPDATE SET paused = excluded.paused",
    ),
  };

  return {
    kind: "sqlite",
    async insert(row) {
      q.insert.run(
        row.id, row.ns, row.blobId ?? null, row.type, row.status,
        row.pendingText ?? null, row.source ?? null, row.createdAt, row.expiresAt ?? null,
      );
    },
    async markStored(id, blobId) {
      q.stored.run(blobId, id);
    },
    async markFailed(id) {
      q.failed.run(id);
    },
    /** Resolves true if a known row was updated. */
    async setStatus(ns, idOrBlob, status) {
      return q.setStatus.run(status, ns, idOrBlob, idOrBlob).changes > 0;
    },
    async rows(ns) {
      return q.byNs.all(ns);
    },
    async row(ns, idOrBlob) {
      return q.one.get(ns, idOrBlob, idOrBlob) ?? null;
    },
    /** A failed save goes back to 'saving'. Resolves true if there was one to retry. */
    async markRetrying(ns, id) {
      return q.retrying.run(ns, id).changes > 0;
    },
    /** Memories that are stored or still uploading. */
    async countLive(ns) {
      return q.live.get(ns).n;
    },
    async addEvent(ns, kind, n = 1) {
      q.addEvent.run(ns, kind, n, Date.now());
    },
    /** Per-namespace usage: event totals and the memory status counts. */
    async usage() {
      return { events: q.usage.all(), statuses: q.statusCounts.all() };
    },
    /** Saves whose upload was still in flight when the process last stopped. */
    async unfinishedUploads() {
      return q.unfinished.all();
    },
    /** Blobs awaiting permanent deletion by the owner-wallet admin script. */
    async forgottenBlobs() {
      return q.forgotten.all();
    },
    async hasAny(ns) {
      return q.count.get(ns).n > 0;
    },
    async wasIntroduced(ns) {
      return !!q.introduced.get(ns);
    },
    async markIntroduced(ns) {
      q.setIntroduced.run(ns, Date.now());
    },
    async isPaused(ns) {
      return q.paused.get(ns)?.paused === 1;
    },
    async setPaused(ns, paused) {
      q.setPaused.run(ns, paused ? 1 : 0);
    },
    /** Remove every row for a namespace. For tests; "forget" in the app only tombstones. */
    async purge(ns) {
      for (const table of ["memories", "settings", "introductions", "events"]) {
        db.prepare(`DELETE FROM ${table} WHERE ns = ?`).run(ns);
      }
    },
    async close() {
      db.close();
    },
  };
}
