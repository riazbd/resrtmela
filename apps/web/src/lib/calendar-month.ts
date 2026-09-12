/**
 * Going to a month on a calendar.
 *
 * Both calendars could only be walked — ← Today →, a span at a time — so
 * reaching October from August took four presses and reaching last March took
 * however many it took. `<input type="month">` is the control people already
 * know; these are the three pieces of arithmetic behind it.
 *
 * Written as functions with tests because each is wrong in a way that is quiet:
 * a month is not thirty days, February is not twenty-eight every year, and a
 * jump that lands on the 2nd looks like it worked.
 */

/** `2026-09-13` → `2026-09`, the value an `<input type="month">` carries. */
export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

/** `2026-10` (or `2026-10-17`) → `2026-10-01`; null when it is not a month. */
export function monthStart(value: string): string | null {
  const m = /^(\d{4})-(\d{2})/.exec(value);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return `${m[1]}-${m[2]}-01`;
}

/**
 * The number of days in a month, for the span a jump should show.
 *
 * Day 0 of the following month is the last day of this one, which is the one
 * piece of `Date` arithmetic that handles February and leap years without
 * anybody writing the rules down again.
 */
export function monthLength(value: string): number {
  const m = /^(\d{4})-(\d{2})/.exec(value);
  if (!m) return 30; // a span of NaN renders an empty grid and reports nothing
  const month = Number(m[2]);
  if (month < 1 || month > 12) return 30;
  return new Date(Date.UTC(Number(m[1]), month, 0)).getUTCDate();
}
