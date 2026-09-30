import pg from "pg";

/**
 * Postgres backend for the memory index — same interface as index-db.js.
 * Used when DATABASE_URL is set (e.g. a Neon database), so the service can run
 * on hosts without a persistent disk.
 *
 * Tables are prefixed attie_ so they can share a database with other things.
 */
export async function openPgIndex(connectionString) {
  const pool = new pg.Pool({ connectionString, max: 3 });
  // A dropped idle connection (serverless Postgres suspends) must not crash the process.
  pool.on("error", (err) => console.error(`index database connection error: ${err.message}`));

  await pool.query(`
    CREATE TABLE IF NOT EXISTS attie_memories (
      id TEXT PRIMARY KEY,
      ns TEXT NOT NULL,
      blob_id TEXT,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      pending_text TEXT,
      source TEXT,
      created_at BIGINT NOT NULL,
      expires_at BIGINT
    );
    CREATE INDEX IF NOT EXISTS attie_memories_ns ON attie_memories (ns, status);
    CREATE INDEX IF NOT EXISTS attie_memories_blob ON attie_memories (blob_id);
    CREATE TABLE IF NOT EXISTS attie_settings (ns TEXT PRIMARY KEY, paused BOOLEAN NOT NULL DEFAULT FALSE);
    CREATE TABLE IF NOT EXISTS attie_introductions (ns TEXT PRIMARY KEY, at BIGINT NOT NULL);
  `);

  // BIGINT arrives as a string; the store compares these as numbers.
  const toRow = (r) => ({
    ...r,
    created_at: Number(r.created_at),
    expires_at: r.expires_at == null ? null : Number(r.expires_at),
  });

  return {
    kind: "postgres",
    async insert(row) {
      await pool.query(
        "INSERT INTO attie_memories (id, ns, blob_id, type, status, pending_text, source, created_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        [
          row.id, row.ns, row.blobId ?? null, row.type, row.status,
          row.pendingText ?? null, row.source ?? null, row.createdAt, row.expiresAt ?? null,
        ],
      );
    },
    async markStored(id, blobId) {
      // Keep 'forgotten' if the employee forgot it while it was still uploading.
      await pool.query(
        "UPDATE attie_memories SET blob_id = $1, pending_text = NULL, status = CASE WHEN status = 'saving' THEN 'active' ELSE status END WHERE id = $2",
        [blobId, id],
      );
    },
    async markFailed(id) {
      // A failed upload of a still-wanted memory keeps its text; one that was forgotten meanwhile drops it.
      await pool.query(
        "UPDATE attie_memories SET pending_text = CASE WHEN status = 'saving' THEN pending_text ELSE NULL END, status = CASE WHEN status = 'saving' THEN 'failed' ELSE status END WHERE id = $1",
        [id],
      );
    },
    /** Resolves true if a known row was updated. */
    async setStatus(ns, idOrBlob, status) {
      const res = await pool.query(
        "UPDATE attie_memories SET status = $1 WHERE ns = $2 AND (id = $3 OR blob_id = $3)",
        [status, ns, idOrBlob],
      );
      return res.rowCount > 0;
    },
    async rows(ns) {
      const res = await pool.query("SELECT * FROM attie_memories WHERE ns = $1", [ns]);
      return res.rows.map(toRow);
    },
    async unfinishedUploads() {
      const res = await pool.query(
        "SELECT * FROM attie_memories WHERE status = 'saving' AND pending_text IS NOT NULL",
      );
      return res.rows.map(toRow);
    },
    async forgottenBlobs() {
      const res = await pool.query(
        "SELECT ns, blob_id FROM attie_memories WHERE status = 'forgotten' AND blob_id IS NOT NULL",
      );
      return res.rows;
    },
    async hasAny(ns) {
      const res = await pool.query("SELECT 1 FROM attie_memories WHERE ns = $1 LIMIT 1", [ns]);
      return res.rowCount > 0;
    },
    async wasIntroduced(ns) {
      const res = await pool.query("SELECT 1 FROM attie_introductions WHERE ns = $1", [ns]);
      return res.rowCount > 0;
    },
    async markIntroduced(ns) {
      await pool.query(
        "INSERT INTO attie_introductions (ns, at) VALUES ($1, $2) ON CONFLICT (ns) DO NOTHING",
        [ns, Date.now()],
      );
    },
    async isPaused(ns) {
      const res = await pool.query("SELECT paused FROM attie_settings WHERE ns = $1", [ns]);
      return res.rows[0]?.paused === true;
    },
    async setPaused(ns, paused) {
      await pool.query(
        "INSERT INTO attie_settings (ns, paused) VALUES ($1, $2) ON CONFLICT (ns) DO UPDATE SET paused = EXCLUDED.paused",
        [ns, !!paused],
      );
    },
    /** Remove every row for a namespace. For tests; "forget" in the app only tombstones. */
    async purge(ns) {
      for (const table of ["attie_memories", "attie_settings", "attie_introductions"]) {
        await pool.query(`DELETE FROM ${table} WHERE ns = $1`, [ns]);
      }
    },
    async close() {
      await pool.end();
    },
  };
}
