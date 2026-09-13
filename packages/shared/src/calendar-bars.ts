/**
 * Nights → bars.
 *
 * Both calendars drew every night as its own cell, so a three-night booking was
 * three disconnected blocks and the guest's name was crammed into each of them
 * at 9px and truncated. That is most of why a month grid reads as noise: the
 * eye has to reassemble a stay out of squares, and the text it does that with
 * is unreadable anyway.
 *
 * Merged into a run, a stay is one bar with the width of the whole stay to
 * write a name in — and a free stretch is one pale bar rather than thirty
 * outlines. The arithmetic lives here, with its tests, the way `occupancyCells`
 * already does.
 */

/** A stretch of consecutive days carrying the same thing (or nothing). */
export interface Run<T> {
  /** the first day of the stretch, `YYYY-MM-DD` */
  from: string;
  /** how many days it covers — the `colSpan` a table cell needs */
  nights: number;
  /** what occupies it, or null for free nights */
  value: T | null;
}

/**
 * Walks `days` in order and merges neighbours that carry the same thing.
 *
 * `idOf` decides sameness rather than object identity, because the caller
 * usually looks its value up fresh for every day and two lookups of the same
 * booking are not the same object. A stay that leaves and comes back is two
 * runs on purpose: one bar across the gap would paint over a night that is
 * free to sell, which is the exact mistake this grid is here to stop making.
 *
 * The runs always cover `days` exactly, so a row of them fills the month with
 * no arithmetic left for the caller.
 */
export function mergeRuns<T>(
  days: string[],
  at: (day: string) => T | null,
  idOf: (value: T) => string | number,
): Run<T>[] {
  const runs: Run<T>[] = [];
  let current: Run<T> | null = null;
  let currentId: string | number | null = null;

  for (const day of days) {
    const value = at(day);
    const id = value == null ? null : idOf(value);
    if (current && id === currentId) {
      current.nights += 1;
      continue;
    }
    current = { from: day, nights: 1, value };
    currentId = id;
    runs.push(current);
  }
  return runs;
}
