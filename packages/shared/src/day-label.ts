/**
 * What the API sends, as a person reads it.
 *
 * The API sends a booking's dates two ways and always has. The day sheet
 * answers `date: "2026-09-20"` — a bare civil date. A booking row answers
 * `checkIn: "2026-09-21T00:00:00.000Z"`, because that column is a `DateTime`
 * and Nest serialises it whole. Nothing in the types tells them apart: both
 * are `string | null`.
 *
 * The phone's bookings list assumed the first, appended a time of its own,
 * and drew "Invalid Date → Invalid Date" over eight real bookings. Its unit
 * tests were green, because the fixture had been written to agree with the
 * code instead of with the server.
 *
 * Two decisions follow from that, and both are here rather than in a screen:
 *
 * **The zone is UTC.** These are stored at UTC midnight, so rendering them
 * in the reader's own zone moves the day backwards for anybody west of
 * Greenwich — a stay does not start a day earlier because the person looking
 * at it is in New York. The day is read out of the string and drawn as
 * written.
 *
 * **The month names are written down, not asked for.** `toLocaleDateString`
 * is the obvious way and the wrong one here: it is the same call on Node and
 * on Hermes and it does not answer the same thing. Node's `en-GB` says
 * "Sept"; an Android build without full ICU can hand back the raw ISO string
 * and put `2026-09-21T00:00:00.000Z` on a booking row. Twelve words are
 * cheaper than that failure, and they are the same twelve on every engine.
 */

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

const WEEKDAYS_LONG = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
] as const;

export type DayStyle =
  /** `21 Sep` — a list, where the year is noise. */
  | "short"
  /** `21 Sep 26` — a date standing on its own. */
  | "full"
  /** `Sunday, 20 September 2026` — a screen that is about one day. */
  | "long";

/** Whatever it was, as a `Date` at UTC noon — or null if it was not a date. */
function atUtcNoon(value: string | Date): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  // both shapes start with the civil date, so ten characters is the whole
  // question; anything after them is a time this function does not want
  const civil = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(civil)) return null;
  const at = new Date(`${civil}T12:00:00Z`);
  if (Number.isNaN(at.getTime())) return null;
  // `2026-13-45` parses on some engines and rolls over on others; asking the
  // date back is the only answer that holds everywhere
  return at.toISOString().slice(0, 10) === civil ? at : null;
}

/**
 * A day, drawn.
 *
 * An em dash for nothing and for nonsense alike: a booking with no dates is
 * a real row an import can produce, and it should read as a gap rather than
 * as a fault. "Invalid Date" on a screen is a fault a user has to report.
 */
export function dayLabel(
  value: string | Date | null | undefined,
  { style = "short" }: { style?: DayStyle } = {},
): string {
  if (!value) return "—";
  const at = atUtcNoon(value);
  if (!at) return "—";

  const day = at.getUTCDate();
  const month = at.getUTCMonth();
  const year = at.getUTCFullYear();

  if (style === "long") {
    return `${WEEKDAYS_LONG[at.getUTCDay()]}, ${day} ${MONTHS_LONG[month]} ${year}`;
  }
  const padded = String(day).padStart(2, "0");
  const short = `${padded} ${MONTHS_SHORT[month]}`;
  return style === "full" ? `${short} ${String(year).slice(-2)}` : short;
}
