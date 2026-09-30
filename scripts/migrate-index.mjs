#!/usr/bin/env node
/**
 * Copy the local SQLite memory index into Postgres — run once when moving
 * from a local/disk deployment to DATABASE_URL. Without this, memories that
 * were forgotten locally would become recallable again, because their
 * tombstones live only in the index.
 *
 *   npm run migrate:index        (reads DB_PATH and DATABASE_URL from .env)
 *
 * Safe to run more than once: rows already in Postgres are left as they are.
 */
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import pg from "pg";
import { config } from "../src/config.js";
import { openPgIndex } from "../src/memory/index-pg.js";

if (!config.databaseUrl) {
  console.error("Set DATABASE_URL in .env first.");
  process.exit(1);
}
if (!existsSync(config.dbPath)) {
  console.log(`No local index at ${config.dbPath} — nothing to copy.`);
  process.exit(0);
}

// Creates the tables if they are not there yet.
await (await openPgIndex(config.databaseUrl)).close();

const local = new DatabaseSync(config.dbPath, { readOnly: true });
const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 1 });
const tableExists = (name) =>
  !!local.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);

const copied = { memories: 0, settings: 0, introductions: 0 };

for (const r of local.prepare("SELECT * FROM memories").all()) {
  const res = await pool.query(
    "INSERT INTO attie_memories (id, ns, blob_id, type, status, pending_text, source, created_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (id) DO NOTHING",
    [r.id, r.ns, r.blob_id, r.type, r.status, r.pending_text, r.source, r.created_at, r.expires_at],
  );
  copied.memories += res.rowCount;
}
for (const r of local.prepare("SELECT * FROM settings").all()) {
  const res = await pool.query(
    "INSERT INTO attie_settings (ns, paused) VALUES ($1, $2) ON CONFLICT (ns) DO NOTHING",
    [r.ns, r.paused === 1],
  );
  copied.settings += res.rowCount;
}
if (tableExists("introductions")) {
  for (const r of local.prepare("SELECT * FROM introductions").all()) {
    const res = await pool.query(
      "INSERT INTO attie_introductions (ns, at) VALUES ($1, $2) ON CONFLICT (ns) DO NOTHING",
      [r.ns, r.at],
    );
    copied.introductions += res.rowCount;
  }
}

await pool.end();
local.close();
console.log("Copied into Postgres:", copied);
