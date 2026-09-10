/**
 * Dates as the resort counts them.
 *
 * `new Date().toISOString().slice(0, 10)` is today in UTC, and the console said
 * it seven times over — the day sheet, the expense register, the restaurant,
 * activities, reports, the agency calendar and the room search — each with its
 * own copy of the same one-line helper. Bangladesh is UTC+6, so from 18:00
 * local every one of those defaults was tomorrow: the desk opened the day sheet
 * on a day that had not started, the evening's fuel was filed under tomorrow,
 * and clicking an empty night on the calendar handed the booking form the wrong
 * date. That is the shift the front desk actually works.
 *
 * `Resort.timezone` has been in the schema and read by three places in the API
 * and none in the console. It decides here.
 */

/** Today at this resort, as `YYYY-MM-DD`. */
export function todayIn(timeZone: string | undefined, now: Date = new Date()): string {
  return civilDate(now, timeZone);
}

/**
 * The civil date at a zone, without pulling in a date library.
 *
 * `en-CA` formats as `YYYY-MM-DD`, which is the shape every date input and
 * every API query string wants. An unknown zone falls back to UTC rather than
 * throwing: a console that will not render because someone mistyped a timezone
 * is a worse failure than one showing the wrong day.
 */
function civilDate(d: Date, timeZone: string | undefined): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** `YYYY-MM-DD` plus or minus whole days. Anchored at UTC noon so no offset can drift it. */
export function addDaysIso(iso: string, days: number): string {
  const at = new Date(`${iso}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/**
 * `YYYY-MM` plus or minus whole months.
 *
 * The platform screen did this with `new Date(y, m - 1 + delta, 1).toISOString()`,
 * which converts local midnight to the previous day in any positive-offset
 * browser and so lands in the previous month. In Dhaka the Next arrow returned
 * the month it started from and appeared to do nothing.
 */
export function monthOf(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const at = new Date(Date.UTC(y!, (m! - 1) + delta, 1, 12));
  return at.toISOString().slice(0, 7);
}

/** The last day of a `YYYY-MM`, as `YYYY-MM-DD`. */
monthOf.lastDay = (month: string): string => {
  const [y, m] = month.split("-").map(Number);
  // day 0 of the next month is the last day of this one
  return new Date(Date.UTC(y!, m!, 0, 12)).toISOString().slice(0, 10);
};

/** The first day of a `YYYY-MM`. */
monthOf.firstDay = (month: string): string => `${month}-01`;
