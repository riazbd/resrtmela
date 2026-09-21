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
import { MONTHS_LONG, WEEKDAYS_LONG } from "./day-label";

/**
 * "Sun", "Mon" — the heading above a column of dates.
 *
 * Here rather than `WEEKDAYS_LONG[weekdayOf(d)].slice(0, 3)` at each
 * call site: three characters is a decision about how much room a
 * column header has, and two screens slicing to different lengths is
 * how one calendar says "Wed" while the next says "Wednes".
 */
export function weekdayShort(iso: string): string {
  return WEEKDAYS_LONG[weekdayOf(iso)]?.slice(0, 3) ?? "";
}

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


/**
 * The month `by` months away — December after November, and the year
 * with it (2026-09-21).
 *
 * Both calendars stepped a month by adding or subtracting a *day* and
 * asking `monthOf` what month that landed in. That works, and it is
 * the reason neither could do anything else: stepping a year meant
 * twelve of them, so in practice the calendar could see the month it
 * opened on and the two beside it. This is the arithmetic a month
 * picker needs.
 *
 * Done on a month index rather than on a `Date`, because
 * `setMonth(getMonth() + n)` overflows — 31 January plus a month is
 * 3 March — and this file already carries one comment about that.
 */
export function stepMonth(month: string, by: number): string {
  const m = /^(\d{4})-(\d{2})/.exec(month);
  if (!m) return month;
  const mm = Number(m[2]);
  if (mm < 1 || mm > 12) return month;
  const zero = Number(m[1]) * 12 + (mm - 1) + by;
  if (zero < 0) return month;
  return `${String(Math.floor(zero / 12)).padStart(4, "0")}-${String((zero % 12) + 1).padStart(2, "0")}`;
}

/**
 * "2026-09" as a person says it.
 *
 * Written out by hand in five places — two payroll screens, two
 * calendars and a picker — which is five chances for one of them to
 * say "Sep" while the others say "September".
 */
export function monthTitle(month: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(month);
  if (!m) return month;
  const name = MONTHS_LONG[Number(m[2]) - 1];
  return name ? `${name} ${m[1]}` : month;
}
