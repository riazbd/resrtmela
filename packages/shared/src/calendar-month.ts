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

/** Which day of the week a date falls on, read at noon so no zone can shift it. */
export const weekdayOf = (iso: string): number => new Date(`${iso}T12:00:00Z`).getUTCDay();

/**
 * The weekend, as Bangladesh keeps it: Friday and Saturday.
 *
 * Both calendars had Thursday and Friday. Bangladesh moved to Friday–Saturday
 * in 2009 and the working week runs Sunday to Thursday, so a resort's two
 * busiest nights were highlighted one column early — and the seasonal rates
 * people build around what the grid shows were being read off the wrong days.
 *
 * One definition rather than a constant in each calendar: the two had already
 * been copied, and two copies of a rule are a disagreement waiting for one of
 * them to be edited.
 */
export const isWeekend = (iso: string): boolean => weekdayOf(iso) === 5 || weekdayOf(iso) === 6;

/** Sunday — where the grid draws its hairline, now that Saturday is a day off. */
export const startsTheWeek = (iso: string): boolean => weekdayOf(iso) === 0;

/**
 * A month as rows of seven, Sunday first, padded with nulls at both ends.
 *
 * Sunday first because that is where Bangladesh's week starts — Friday and
 * Saturday are the weekend, so they fall in the last two columns, which is
 * where a resort's eye goes looking for its busiest nights.
 *
 * Rectangular on purpose: a grid whose last row is short makes CSS do the
 * padding, and CSS pads at the end of the row in one direction and the start
 * in the other. Nulls are the blanks, and they are explicit.
 */
export function monthGrid(month: string): (string | null)[][] {
  const first = monthStart(month);
  if (!first) return [];
  const days = monthLength(month);
  const cells: (string | null)[] = Array.from({ length: weekdayOf(first) }, () => null);
  for (let d = 1; d <= days; d++) cells.push(`${month.slice(0, 7)}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}

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
