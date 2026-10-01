import assert from "node:assert/strict";
import { test } from "node:test";
import { openIndex } from "../src/memory/index-db.js";
import { openPgIndex } from "../src/memory/index-pg.js";

/**
 * Both index backends must behave the same. SQLite always runs; Postgres runs
 * when TEST_DATABASE_URL is set (rows go under a throwaway namespace and are
 * removed afterwards):
 *
 *   TEST_DATABASE_URL=postgres://… npm test
 */
const backends = [["sqlite", async () => openIndex(":memory:")]];
if (process.env.TEST_DATABASE_URL) {
  backends.push(["postgres", () => openPgIndex(process.env.TEST_DATABASE_URL)]);
}

for (const [name, open] of backends) {
  test(`index contract: ${name}`, async () => {
    const index = await open();
    const ns = `selftest:${Date.now().toString(36)}`;
    const other = `${ns}:other`;
    try {
      assert.equal(await index.hasAny(ns), false);

      await index.insert({
        id: `${ns}-a`, ns, type: "goal", status: "saving",
        pendingText: "Wants to become a tech lead.", source: "extracted",
        createdAt: 1790000000000, expiresAt: 1800000000000,
      });
      assert.equal(await index.hasAny(ns), true);
      assert.equal(await index.hasAny(other), false);

      let [row] = await index.rows(ns);
      assert.equal(row.status, "saving");
      assert.equal(row.pending_text, "Wants to become a tech lead.");
      // Timestamps come back as numbers on every backend.
      assert.strictEqual(row.created_at, 1790000000000);
      assert.strictEqual(row.expires_at, 1800000000000);
      assert.equal((await index.unfinishedUploads()).some((r) => r.id === `${ns}-a`), true);

      // Stored: becomes active, text is dropped, blob id is known.
      await index.markStored(`${ns}-a`, `${ns}-blob-a`);
      [row] = await index.rows(ns);
      assert.deepEqual([row.status, row.blob_id, row.pending_text], ["active", `${ns}-blob-a`, null]);

      // Status can be set by row id or by blob id, only within the namespace.
      assert.equal(await index.setStatus(other, `${ns}-blob-a`, "forgotten"), false);
      assert.equal(await index.setStatus(ns, `${ns}-blob-a`, "forgotten"), true);
      assert.equal(await index.setStatus(ns, "no-such-id", "forgotten"), false);
      assert.equal((await index.forgottenBlobs()).some((r) => r.blob_id === `${ns}-blob-a`), true);

      // Forgotten while uploading: stays forgotten when the upload lands.
      await index.insert({
        id: `${ns}-b`, ns, type: "plan", status: "saving", pendingText: "Wants December off.", createdAt: 1790000000001,
      });
      await index.setStatus(ns, `${ns}-b`, "forgotten");
      await index.markStored(`${ns}-b`, `${ns}-blob-b`);
      const b = (await index.rows(ns)).find((r) => r.id === `${ns}-b`);
      assert.deepEqual([b.status, b.pending_text, b.expires_at], ["forgotten", null, null]);

      // A failed upload keeps its text so it can be retried.
      await index.insert({
        id: `${ns}-c`, ns, type: "focus", status: "saving", pendingText: "Learning Next.js.", createdAt: 1790000000002,
      });
      await index.markFailed(`${ns}-c`);
      const c = (await index.rows(ns)).find((r) => r.id === `${ns}-c`);
      assert.deepEqual([c.status, c.pending_text], ["failed", "Learning Next.js."]);

      // Single-row lookup, retrying a failed save, and the live count.
      assert.equal((await index.row(ns, `${ns}-blob-b`)).id, `${ns}-b`);
      assert.equal(await index.row(other, `${ns}-c`), null);
      assert.equal(await index.countLive(ns), 0);
      assert.equal(await index.markRetrying(other, `${ns}-c`), false);
      assert.equal(await index.markRetrying(ns, `${ns}-c`), true);
      assert.equal((await index.row(ns, `${ns}-c`)).status, "saving");
      assert.equal(await index.markRetrying(ns, `${ns}-c`), false);
      assert.equal(await index.countLive(ns), 1);

      // Usage counts.
      await index.addEvent(ns, "turn");
      await index.addEvent(ns, "turn");
      await index.addEvent(ns, "memories_saved", 3);
      const { events, statuses } = await index.usage();
      const mine = events.filter((e) => e.ns === ns);
      assert.equal(mine.find((e) => e.kind === "turn").total, 2);
      assert.equal(mine.find((e) => e.kind === "memories_saved").total, 3);
      assert.equal(mine.find((e) => e.kind === "turn").days, 1);
      assert.equal(statuses.find((s) => s.ns === ns && s.status === "forgotten").n, 2);

      // Settings and the one-time introduction.
      assert.equal(await index.isPaused(ns), false);
      await index.setPaused(ns, true);
      assert.equal(await index.isPaused(ns), true);
      await index.setPaused(ns, false);
      assert.equal(await index.isPaused(ns), false);

      assert.equal(await index.wasIntroduced(ns), false);
      await index.markIntroduced(ns);
      await index.markIntroduced(ns);
      assert.equal(await index.wasIntroduced(ns), true);
    } finally {
      await index.purge(ns);
      assert.equal(await index.hasAny(ns), false);
      await index.close();
    }
  });
}
