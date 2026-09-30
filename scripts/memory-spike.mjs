#!/usr/bin/env node
/**
 * Walrus Memory spike — answers the questions the memory design depends on:
 *
 *   1. How long does a remember take (accepted → stored on Walrus)?
 *   2. Does recall put the right memory first for a natural question?
 *   3. Can we list everything we hold for one employee (for the
 *      "What Atty remembers" page)?
 *   4. Does "newest wins" work for corrections (sort: "recent")?
 *   5. Can one memory be forgotten? (The SDK has no per-memory forget, so we
 *      test the planned workaround: filter recall by a tombstoned blob_id.)
 *   6. Are two employees' namespaces isolated?
 *
 * Real relayer:  npm run spike:memory            (needs MEMWAL_* in .env)
 * Offline mock:  npm run spike:memory -- --mock  (checks the script itself)
 *
 * Each run writes to fresh namespaces (attendee-spike:<run>:…), so runs never
 * mix with each other or with real employee memories.
 */

import { MemWal, MemWalMock } from "@mysten-incubation/memwal";

const useMock = process.argv.includes("--mock");
const run = Date.now().toString(36);
const nsA = `attendee-spike:${run}:employee-a`;
const nsB = `attendee-spike:${run}:employee-b`;

function createClient() {
  if (useMock) return MemWalMock.create({ namespace: nsA });
  const { MEMWAL_PRIVATE_KEY, MEMWAL_ACCOUNT_ID, MEMWAL_SERVER_URL } = process.env;
  if (!MEMWAL_PRIVATE_KEY || !MEMWAL_ACCOUNT_ID) {
    console.error(
      "Set MEMWAL_PRIVATE_KEY and MEMWAL_ACCOUNT_ID in .env, or run with --mock.",
    );
    process.exit(1);
  }
  return MemWal.create({
    key: MEMWAL_PRIVATE_KEY,
    accountId: MEMWAL_ACCOUNT_ID,
    serverUrl: MEMWAL_SERVER_URL || undefined,
    namespace: nsA,
  });
}

// Memories as the service will write them: one typed, first-person-free
// sentence each. No HR figures, no other people.
const EMPLOYEE_A = [
  "[focus] Joined the engineering team as a frontend developer.",
  "[focus] Currently learning Next.js.",
  "[preference] Prefers short, bullet-point answers.",
  "[goal] Wants to move into a tech-lead role within two years.",
  "[plan] Wants to take the week of 22 December off.",
];
const CORRECTION = "[focus] Moved from the frontend team to the backend team.";
const EMPLOYEE_B = ["[preference] Prefers answers in Nigerian Pidgin."];

// Question → the memory that should come back first.
const RECALL_CASES = [
  ["What should I focus on learning this week?", "learning Next.js"],
  ["Can I take time off at the end of the year?", "22 December"],
  ["How should you format your answers for me?", "short, bullet-point"],
  ["What are my career ambitions?", "tech-lead"],
];

const results = [];
function check(name, pass, detail = "") {
  results.push({ check: name, result: pass ? "PASS" : "FAIL", detail });
}

let step = "setup";
// Staging relayer saves took 15–60s+ under load; do not fail on a slow queue.
const WAIT = { timeoutMs: 180_000 };

async function timed(fn) {
  const t = performance.now();
  const value = await fn();
  return { value, ms: Math.round(performance.now() - t) };
}

async function main() {
  const memwal = createClient();
  console.log(`Mode: ${useMock ? "mock (offline)" : "real relayer"} · run ${run}\n`);

  if (!useMock) {
    step = "health + compatibility";
    await memwal.health();
    await memwal.compatibility();
    check("relayer health + SDK compatibility", true);
  }

  // 1. Latency: accept vs. fully stored.
  step = "first remember";
  const accept = await timed(() => memwal.remember(EMPLOYEE_A[0], nsA));
  const stored = await timed(() => memwal.waitForRememberJob(accept.value.job_id, WAIT));
  check(
    "remember: accepted → stored",
    !!stored.value.blob_id,
    `accept ${accept.ms} ms, then ${stored.ms} ms until stored`,
  );

  const waits = [];
  for (const text of EMPLOYEE_A.slice(1)) {
    const r = await timed(() => memwal.rememberAndWait(text, nsA, WAIT));
    waits.push(r.ms);
  }
  const avg = Math.round(waits.reduce((a, b) => a + b, 0) / waits.length);
  check("rememberAndWait x4", true, `avg ${avg} ms, max ${Math.max(...waits)} ms`);

  await memwal.rememberAndWait(EMPLOYEE_B[0], nsB, WAIT);

  // 2. Recall ranking.
  for (const [query, expected] of RECALL_CASES) {
    const { value, ms } = await timed(() =>
      memwal.recall({ query, namespace: nsA, limit: 3 }),
    );
    const top = value.results[0];
    check(
      `recall: "${query}"`,
      !!top?.text.includes(expected),
      top
        ? `top="${top.text.slice(0, 45)}…" d=${top.distance.toFixed(3)} (${ms} ms)`
        : "no results",
    );
  }

  // 3. List everything for one employee via a broad recall.
  const all = await memwal.recall({
    query: "facts about this employee",
    namespace: nsA,
    limit: 100,
  });
  check(
    "list all via broad recall",
    all.results.length === EMPLOYEE_A.length,
    `${all.results.length}/${EMPLOYEE_A.length} returned, created_at present: ${all.results.every((r) => !!r.created_at)}`,
  );

  // 4. Correction: newest wins with sort: "recent".
  await memwal.rememberAndWait(CORRECTION, nsA, WAIT);
  const recent = await memwal.recall({
    query: "Which team am I on?",
    namespace: nsA,
    limit: 3,
    sort: "recent",
  });
  check(
    'correction wins with sort: "recent"',
    !!recent.results[0]?.text.includes("backend"),
    `top="${recent.results[0]?.text.slice(0, 50) ?? "none"}"`,
  );

  // 5. Forget one memory: the relayer can't, so tombstone its blob_id.
  const target = all.results.find((r) => r.text.includes("22 December"));
  const tombstones = new Set(target ? [target.blob_id] : []);
  const again = await memwal.recall({
    query: "Can I take time off at the end of the year?",
    namespace: nsA,
    limit: 5,
  });
  const stillOnRelayer = again.results.some((r) => tombstones.has(r.blob_id));
  const afterFilter = again.results.filter((r) => !tombstones.has(r.blob_id));
  check(
    "forget one memory via blob_id tombstone",
    !!target && !afterFilter.some((r) => r.text.includes("22 December")),
    `relayer still returns it: ${stillOnRelayer} (expected true — filtered out by us)`,
  );

  // 6. Namespace isolation.
  const crossA = await memwal.recall({ query: "Pidgin", namespace: nsA, limit: 5 });
  const crossB = await memwal.recall({ query: "Next.js", namespace: nsB, limit: 5 });
  check(
    "namespace isolation (A ↛ B, B ↛ A)",
    !crossA.results.some((r) => r.text.includes("Pidgin")) &&
      !crossB.results.some((r) => r.text.includes("Next.js")),
    `A→B hits ${crossA.results.length}, B→A hits ${crossB.results.length}`,
  );

  if (!useMock) {
    const ns = await memwal.listNamespaces();
    const mine = ns.namespaces.filter((n) => JSON.stringify(n).includes(run));
    check("listNamespaces sees this run", mine.length === 2, JSON.stringify(mine[0] ?? {}));
  }

  memwal.destroy?.();
  console.table(results);
  const failed = results.filter((r) => r.result === "FAIL").length;
  console.log(
    `\n${results.length - failed}/${results.length} passed. ` +
      "Relayer points used ≈ 7 remembers × 5 + ~10 recalls × 1 = ~45 (limit 500/h).",
  );
  process.exitCode = failed ? 1 : 0;
}

main().catch((err) => {
  // Only the step, status and relayer body — never the config or headers.
  console.error(`Spike aborted during "${step}":`, err?.message ?? err);
  for (const key of ["status", "statusCode", "code", "body", "details", "cause"]) {
    if (err?.[key] != null) console.error(`  ${key}:`, err[key]);
  }
  process.exit(1);
});
