/**
 * What is allowed into long-term memory.
 *
 * This is HR software: memory holds only personal working context the employee
 * shared about themselves. HR records (balances, pay, attendance) are never
 * stored — they are fetched live. Two layers enforce this: the extraction
 * prompt (src/memory/extract.js) and this deterministic screen, which runs on
 * every write no matter where it came from.
 */

/** Memory types and how long each stays valid (days; null = until changed). */
export const MEMORY_TYPES = {
  preference: { ttlDays: null, label: "Preference" },
  goal: { ttlDays: null, label: "Goal" },
  focus: { ttlDays: 180, label: "Current focus" },
  context: { ttlDays: 90, label: "Context" },
  plan: { ttlDays: 120, label: "Plan" },
  open_thread: { ttlDays: 30, label: "Open thread" },
};

export const MAX_MEMORY_CHARS = 240;

const DENY = [
  // Special-category personal data
  [/\b(diagnos|illness|disease|cancer|diabet|hiv|asthma|depress|anxiety|therapy|therapist|medication|surgery|disabilit|pregnan|miscarriage|mental health|sick(ness)?|hospital|clinic)\w*/i, "health"],
  [/\b(christian|muslim|islam|catholic|pentecostal|church|mosque|religio|pray(er|ing)?|fasting|atheis)\w*/i, "religion"],
  [/\b(gay|lesbian|bisexual|transgender|sexual orientation|sexuality)\b/i, "sexuality"],
  [/\b(tribe|ethnic|yoruba descent|igbo descent|hausa descent|racial)\w*/i, "ethnicity"],
  [/\b(political party|apc|pdp|labour party|vot(e|ed|ing) for|union member|trade union)\b/i, "politics/union"],
  // Things that belong to the HR system or to nobody's memory
  [/\b(salary|net pay|gross pay|payslip|deduction|loan|bank account|account number|bvn|nin|tax id|naira)\b|[\u20a6$\u00a3\u20ac]\s?\d/i, "pay/finance"],
  [/\b(password|passcode|otp|api key|secret key)\b\s*(is|was|:|=)/i, "credentials"],
  [/\b\d+(\.\d+)?\s*(leave )?days? (left|remaining|available|used|taken)\b/i, "leave balance"],
  [/\b\d+\s*(times|days)\s*(late|absent)\b|\b(late|absent)\s*\d+\s*(times|days)\b/i, "attendance record"],
  // Job title, role and authority come from the HR record, never from what someone typed.
  [/^(is|is now|works as|serves as|became|was promoted to|has been promoted to|has been appointed)\s+(the|a|an)?\s*[\w &-]{0,40}\b(manager|director|head of|team lead|tech lead|supervisor|officer|administrator|admin|executive|owner|ceo|cto|cfo|coo)\b/i, "job title/role (comes from the HR record)"],
  // Workplace conflict and discipline — too sensitive to hold on an employer-run system
  [/\b(harass|bully|bullied|discriminat|grievance|disciplin|query letter|warning letter|suspended|lawsuit|sue)\w*/i, "grievance/discipline"],
  [/\b(my|the) (manager|boss|supervisor|colleague|coworker|co-worker|teammate|hr) (is|was|keeps|always|never|hates|doesn't|does not)\b/i, "about another person"],
];

/**
 * @returns {{ ok: true, text: string } | { ok: false, reason: string }}
 */
export function screenMemory({ type, text }) {
  if (!MEMORY_TYPES[type]) return { ok: false, reason: `unknown type "${type}"` };
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length < 8) return { ok: false, reason: "too short to be useful" };
  if (clean.length > MAX_MEMORY_CHARS) return { ok: false, reason: "too long — one sentence only" };
  for (const [pattern, reason] of DENY) {
    if (pattern.test(clean)) return { ok: false, reason: `not stored: ${reason}` };
  }
  return { ok: true, text: clean };
}

/** "[goal] Wants to become a team lead." — the shape written to Walrus. */
export function formatMemory(type, text) {
  return `[${type}] ${text}`;
}

export function parseMemory(raw) {
  const m = String(raw ?? "").match(/^\[([a-z_]+)\]\s*(.+)$/s);
  if (m && MEMORY_TYPES[m[1]]) return { type: m[1], text: m[2].trim() };
  return { type: "context", text: String(raw ?? "").trim() };
}

export function expiryFor(type, expiresInDays, now = Date.now()) {
  const days = expiresInDays ?? MEMORY_TYPES[type]?.ttlDays ?? null;
  return days == null ? null : now + days * 86_400_000;
}
