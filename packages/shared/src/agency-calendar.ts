/**
 * Stays → a month grid.
 *
 * The API sends spans ("room 3, the 5th to the 8th"); the screen draws squares
 * ("room 3, the 6th"). Turning one into the other is the whole of the agency
 * calendar's arithmetic, and it is kept here rather than in the component so
 * the rule that decides what a square means can be tested on its own.
 */

/** One occupied span, exactly as `/agent/calendar` sends it. */
export interface CalendarStay {
  roomId: number;
  checkIn: string;
  checkOut: string;
  mine: boolean;
  state: string;
  guestName: string | null;
  code: string | null;
  /** both null unless the stay is the agency's own */
  bookingId: number | null;
  paymentState: string | null;
}

/**
 * A square carries everything the bar drawn over it has to show: whose it is,
 * who is in it, what state the stay is in, whether money is still owed, and
 * the id to open it by. The API sends nulls for the last three on a stay the
 * agency did not sell, so a grey block is all that can be drawn from one.
 */
export interface CalendarCell {
  mine: boolean;
  guestName: string | null;
  code: string | null;
  state: string;
  bookingId: number | null;
  paymentState: string | null;
}

const DAY_MS = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Every night each room is not free, keyed `roomId|YYYY-MM-DD`.
 *
 * A stay covers check-in up to *but not including* check-out. The guest leaves
 * on the checkout morning and the room is sellable that night — painting it as
 * taken would quietly lose a night on every booking in the month.
 */
export function occupancyCells(stays: CalendarStay[]): Map<string, CalendarCell> {
  const cells = new Map<string, CalendarCell>();
  for (const s of stays) {
    const start = new Date(s.checkIn);
    const end = new Date(s.checkOut);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    for (let t = start.getTime(); t < end.getTime(); t += DAY_MS) {
      cells.set(`${s.roomId}|${iso(new Date(t))}`, {
        mine: s.mine,
        guestName: s.guestName,
        code: s.code,
        state: s.state,
        bookingId: s.bookingId,
        paymentState: s.paymentState,
      });
    }
  }
  return cells;
}

/**
 * The longest stay anyone means to select by clicking twice.
 *
 * A mis-click on the 1st and then the 31st of a later month should not offer a
 * year-long booking, so a span past this is treated as a fresh start rather
 * than a range.
 */
export const MAX_SPAN_NIGHTS = 31;

/**
 * Two clicked nights → the stay they describe, or null.
 *
 * Every free square used to open the booking form for that one night, so an
 * agent placing a group went round the loop once per night. This is the rule
 * that lets them click the first and the last instead.
 *
 * Strict on purpose: a span is offered only when *every* night in it is free in
 * that room. Offering a range with a taken night in the middle hands the agent
 * a booking the engine will refuse, after they have quoted it to a guest.
 *
 * `to` is the checkout date — one day past the last night, the way the booking
 * engine counts everywhere else.
 */
export function freeSpan(
  cells: Map<string, CalendarCell>,
  roomId: number,
  a: string,
  b: string,
): { from: string; to: string } | null {
  const [first, last] = a <= b ? [a, b] : [b, a];
  const start = new Date(`${first}T00:00:00Z`).getTime();
  const end = new Date(`${last}T00:00:00Z`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;

  const nights = Math.round((end - start) / DAY_MS) + 1;
  if (nights < 1 || nights > MAX_SPAN_NIGHTS) return null;

  for (let t = start; t <= end; t += DAY_MS) {
    if (cells.has(`${roomId}|${iso(new Date(t))}`)) return null;
  }
  return { from: first, to: iso(new Date(end + DAY_MS)) };
}
