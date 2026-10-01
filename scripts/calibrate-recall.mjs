#!/usr/bin/env node
/**
 * Calibrate the recall similarity cutoff (RECALL_MAX_DISTANCE) on the real
 * Walrus Memory relayer: store a small set of employee memories in a throwaway
 * namespace, ask questions whose relevant memory is known, and print the
 * cosine distances of relevant vs. unrelated hits.
 *
 *   node --env-file=.env scripts/calibrate-recall.mjs
 *
 * Costs about 8 × 5 + 10 × 1 relayer points; takes a minute or two.
 */
import { MemWal } from "@mysten-incubation/memwal";

const memwal = MemWal.create({
  key: process.env.MEMWAL_PRIVATE_KEY,
  accountId: process.env.MEMWAL_ACCOUNT_ID,
  serverUrl: process.env.MEMWAL_SERVER_URL,
});
const ns = `calibrate:${Date.now().toString(36)}`;

const MEMORIES = {
  pref: "[preference] Prefers short, bullet-point answers.",
  goal: "[goal] Wants to become a tech lead within two years.",
  focus: "[focus] Currently learning Next.js.",
  plan: "[plan] Wants to take the week of 21 December off.",
  thread: "[open_thread] Drafted a leave request (Annual) for 2026-12-21 to 2026-12-25; not yet submitted.",
  win: "[achievement] Automated the monthly payroll export.",
  knows: "[knows] Already knows how to submit a leave request in the app.",
  win2: "[achievement] Mentored a new intern through onboarding.",
};

// Question → the memories that should be relevant to it.
const QUESTIONS = [
  ["What should I learn next?", ["focus", "goal"]],
  ["Can I take time off at the end of the year?", ["plan", "thread"]],
  ["Help me prepare for my performance review", ["win", "win2", "goal"]],
  ["How do I request leave?", ["knows", "thread"]],
  ["How was my attendance this month?", []],
  ["When is my next shift?", []],
  ["What is my net pay this month?", []],
  ["How can I grow into a leadership role?", ["goal", "win2"]],
  ["I want to improve my React skills", ["focus"]],
  ["Did I submit my December leave?", ["thread", "plan"]],
];

console.log(`Storing ${Object.keys(MEMORIES).length} memories in ${ns} (about 30–60 s)…`);
const textToKey = new Map(Object.entries(MEMORIES).map(([k, v]) => [v, k]));
await memwal.rememberBulkAndWait(
  Object.values(MEMORIES).map((text) => ({ text, namespace: ns })),
  { timeoutMs: 300_000 },
);

const relevant = [];
const unrelated = [];
for (const [question, wanted] of QUESTIONS) {
  const { results } = await memwal.recall({ query: question, namespace: ns, limit: 8 });
  const row = results
    .map((r) => {
      const key = textToKey.get(r.text) ?? "?";
      const hit = wanted.includes(key);
      (hit ? relevant : unrelated).push(r.distance);
      return `${hit ? "✓" : "·"}${key} ${r.distance.toFixed(3)}`;
    })
    .join("  ");
  console.log(`${question.padEnd(46)} ${row}`);
}

const fmt = (xs) => (xs.length ? `min ${Math.min(...xs).toFixed(3)} · max ${Math.max(...xs).toFixed(3)}` : "none");
console.log(`\nrelevant hits:  ${fmt(relevant)}`);
console.log(`unrelated hits: ${fmt(unrelated)}`);
const best = [0.5, 0.55, 0.6, 0.62, 0.65, 0.68, 0.7, 0.75].map((t) => ({
  cutoff: t,
  relevantKept: relevant.filter((d) => d < t).length,
  unrelatedLet: unrelated.filter((d) => d < t).length,
}));
console.table(best);
console.log(`(${relevant.length} relevant, ${unrelated.length} unrelated hits in total)`);
