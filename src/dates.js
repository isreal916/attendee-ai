/**
 * The weekday of a calendar date ("2026-10-03" → "Saturday"). Models get weekdays wrong when
 * they work them out themselves, so every date shown to the model carries its weekday.
 * The date is read as a plain calendar date, so the server's timezone cannot shift it.
 */
export function weekdayOf(date) {
  const ms = Date.parse(`${String(date).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(ms) ? null : new Date(ms).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
}
