/**
 * The six states a stay can be in.
 *
 * A database enum, not a list a resort owns, so it is declared in code — the
 * accepted exception. It lived as a local constant in the console's bookings
 * page until the phone needed the same six, and a second copy of an enum is
 * how one of them ends up missing a value: it has already happened here once,
 * to the payment methods, where the restaurant's copy had no BANK and a bank
 * transfer had to be recorded as something it was not.
 *
 * The label is a separate function on purpose. An HTML `<option>` with no
 * explicit value sends its own text, and that is exactly how the console's
 * filter once asked the API for `CHECKED-IN` where the enum is `CHECKED_IN`,
 * so three of the six states quietly returned the wrong set. Keeping the two
 * strings visibly apart is what stops that being rewritten.
 */

export const BOOKING_STATES = [
  "PENDING",
  "CONFIRMED",
  "CHECKED_IN",
  "CHECKED_OUT",
  "CANCELLED",
  "NO_SHOW",
] as const;

export type BookingState = (typeof BOOKING_STATES)[number];

export function isBookingState(value: unknown): value is BookingState {
  return typeof value === "string" && (BOOKING_STATES as readonly string[]).includes(value);
}

/**
 * What a person reads, which is never what gets sent.
 *
 * An unrecognised state is title-cased rather than dropped: an imported
 * booking, or a state added to the database before this list caught up, is
 * better shown awkwardly than shown as nothing.
 */
export function bookingStateLabel(state: string): string {
  // sentence case, not title case: "Checked-in", not "Checked-In". The second
  // word of a hyphenated state is part of the same word to a reader.
  const words = state.split("_").map((w) => w.toLowerCase());
  const [first = "", ...rest] = words;
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join("-");
}
