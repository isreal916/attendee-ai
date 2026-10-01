#!/usr/bin/env node
/**
 * Repro: does remember() with the same idempotencyKey store one memory or two?
 * Attie relies on this when it re-sends an upload after a restart or failure.
 * Also times each save end to end.
 *   node --env-file=.env scripts/repro/idempotency.mjs
 */
import { randomUUID } from "node:crypto";
import { MemWal } from "@mysten-incubation/memwal";

const memwal = MemWal.create({
  key: process.env.MEMWAL_PRIVATE_KEY,
  accountId: process.env.MEMWAL_ACCOUNT_ID,
  serverUrl: process.env.MEMWAL_SERVER_URL,
});
const ns = `repro:idempotency:${Date.now().toString(36)}`;
const key = randomUUID();
const text = "[preference] Prefers answers as numbered steps.";

const timed = async (label, fn) => {
  const t = Date.now();
  const r = await fn();
  console.log(`${label}: ${((Date.now() - t) / 1000).toFixed(1)} s`);
  return r;
};
const first = await timed("first save (accept → done)", () =>
  memwal.rememberAndWait(text, ns, { idempotencyKey: key, timeoutMs: 300_000 }),
);
const again = await timed("same key again", () =>
  memwal.rememberAndWait(text, ns, { idempotencyKey: key, timeoutMs: 300_000 }),
);
const { results } = await memwal.recall({ query: "how to format answers", namespace: ns, limit: 10 });
console.log({ sameJob: first.job_id === again.job_id, sameBlob: first.blob_id === again.blob_id, storedCopies: results.filter((r) => r.text === text).length });
