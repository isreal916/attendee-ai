#!/usr/bin/env node
/**
 * Repro: is a memory returned by recall() before its remember job reports "done"?
 * And is created_at present on a freshly stored memory?
 *
 *   node --env-file=.env scripts/repro/recall-before-done.mjs
 */
import { MemWal } from "@mysten-incubation/memwal";

const memwal = MemWal.create({
  key: process.env.MEMWAL_PRIVATE_KEY,
  accountId: process.env.MEMWAL_ACCOUNT_ID,
  serverUrl: process.env.MEMWAL_SERVER_URL,
});
const ns = `repro:recall-before-done:${Date.now().toString(36)}`;
const text = "Prefers answers in short bullet points.";

const t0 = Date.now();
const at = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
const job = await memwal.remember(text, ns);
console.log(at(), "remember accepted:", job.status);

let firstRecall = null;
let firstDone = null;
let lastStatus = "";
while (!firstDone && Date.now() - t0 < 240_000) {
  const [status, recall] = await Promise.all([
    memwal.getRememberStatus(job.job_id),
    memwal.recall({ query: "How should answers be formatted?", namespace: ns, limit: 3 }),
  ]);
  if (status.status !== lastStatus) console.log(at(), "job status:", (lastStatus = status.status));
  const hit = recall.results.find((r) => r.text === text);
  if (hit && !firstRecall) {
    firstRecall = at();
    console.log(firstRecall, "recall returned the memory while job status =", status.status, "| created_at:", hit.created_at ?? "(missing)");
  }
  if (status.status === "done" || status.status === "failed") firstDone = at();
  await new Promise((r) => setTimeout(r, 1500));
}
const after = await memwal.recall({ query: "How should answers be formatted?", namespace: ns, limit: 3 });
console.log(at(), "after done → hits:", after.results.length, "| created_at:", after.results[0]?.created_at ?? "(missing)");
console.log({ namespace: ns, job_id: job.job_id, firstRecall, firstDone });
