import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Local index that sits beside Walrus Memory. Walrus holds the memory text;
 * this holds what the relayer cannot: per-memory status (forgotten,
 * superseded), expiry, and the text of a memory only while its Walrus upload
 * is still in flight (pending_text is cleared once the blob is stored).
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
      status TEXT NOT NULL,          -- saving | active | forgotten | superseded | failed
      pending_text TEXT,
      source TEXT,
      created_at INTEGER NOT NULL,
      expires_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS memories_ns ON memories (ns, status);
    CREATE INDEX IF NOT EXISTS memories_blob ON memories (blob_id);
    CREATE TABLE IF NOT EXISTS settings (ns TEXT PRIMARY KEY, paused INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS introductions (ns TEXT PRIMARY KEY, at INTEGER NOT NULL);
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
    find: db.prepare("SELECT * FROM memories WHERE ns = ? AND (id = ? OR blob_id = ?)"),
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
    insert(row) {
      q.insert.run(
        row.id, row.ns, row.blobId ?? null, row.type, row.status,
        row.pendingText ?? null, row.source ?? null, row.createdAt, row.expiresAt ?? null,
      );
    },
    markStored: (id, blobId) => q.stored.run(blobId, id),
    markFailed: (id) => q.failed.run(id),
    /** Returns true if a known row was updated. */
    setStatus: (ns, idOrBlob, status) => q.setStatus.run(status, ns, idOrBlob, idOrBlob).changes > 0,
    rows: (ns) => q.byNs.all(ns),
    find: (ns, idOrBlob) => q.find.get(ns, idOrBlob, idOrBlob),
    /** Blobs awaiting permanent deletion by the owner-wallet admin script. */
    forgottenBlobs: () => q.forgotten.all(),
    hasAny: (ns) => q.count.get(ns).n > 0,
    wasIntroduced: (ns) => !!q.introduced.get(ns),
    markIntroduced: (ns) => q.setIntroduced.run(ns, Date.now()),
    isPaused: (ns) => q.paused.get(ns)?.paused === 1,
    setPaused: (ns, paused) => q.setPaused.run(ns, paused ? 1 : 0),
    close: () => db.close(),
  };
}
