/**
 * The orders a booking list can be read in (2026-09-19).
 *
 * There was one, fixed: check-in descending. A desk that had just taken three
 * bookings for next March had to hunt for them, because "newest" and "furthest
 * away" are not the same thing and the list only knew the second.
 *
 * Declared here rather than written into the panel and the query separately:
 * the console offers exactly these and the API accepts exactly these, so an
 * option that exists on screen cannot be one the server quietly ignores.
 */

/** The columns a list may be ordered by. Each is indexed. */
export type BookingSortField = "createdAt" | "checkIn" | "checkOut" | "code";

export interface BookingSort {
  /** what the console puts in the URL and sends to the API */
  key: string;
  /** what a person reads in the dropdown */
  label: string;
  field: BookingSortField;
  direction: "asc" | "desc";
}

export const BOOKING_SORTS: readonly BookingSort[] = [
  { key: "newest", label: "Newest booking first", field: "createdAt", direction: "desc" },
  { key: "oldest", label: "Oldest booking first", field: "createdAt", direction: "asc" },
  { key: "checkin", label: "Check-in — soonest first", field: "checkIn", direction: "asc" },
  { key: "checkin-last", label: "Check-in — latest first", field: "checkIn", direction: "desc" },
  { key: "checkout", label: "Check-out — soonest first", field: "checkOut", direction: "asc" },
  { key: "checkout-last", label: "Check-out — latest first", field: "checkOut", direction: "desc" },
  { key: "code", label: "Booking no. — lowest first", field: "code", direction: "asc" },
  { key: "code-desc", label: "Booking no. — highest first", field: "code", direction: "desc" },
];

/**
 * What a list shows when nobody has chosen: what was booked most recently.
 *
 * The desk's question on any given afternoon is "what did we just take", and
 * a booking made this morning for next March was previously eight screens down.
 */
export const DEFAULT_BOOKING_SORT = "newest";

/**
 * The order named, or the default.
 *
 * Never throws: an unknown key is a stale bookmark or somebody's hand-typed
 * URL, and a list that refuses to draw teaches nothing. It draws in the
 * default order, which is the order it would have drawn in anyway.
 */
export function bookingSort(key: string | null | undefined): BookingSort {
  return (
    BOOKING_SORTS.find((s) => s.key === key) ??
    BOOKING_SORTS.find((s) => s.key === DEFAULT_BOOKING_SORT)!
  );
}
