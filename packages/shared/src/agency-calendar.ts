/**
 * Stays → a month grid.
 *
 * The API sends spans ("room 3, the 5th to the 8th"); the screen draws squares
 * ("room 3, the 6th"). Turning one into the other is the whole of the agency
 * calendar's arithmetic, and it is kept here rather than in the component so
 * the rule that decides what a square means can be tested on its own.
 */

import type { AgencyResortMonth } from "./api-types";

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

/**
 * How many rooms an agency could sell at one resort, on one night.
 *
 * The console draws this month as a grid — a row per room, a column per
 * night, across every resort. A phone has four inches and an agent with
 * somebody in front of them asking about a date, so it asks the grid one
 * question per night and shows the number.
 *
 * Three things decide the answer, and getting any of them wrong costs a
 * sale or promises one that does not exist:
 *
 *   - a stay holds check-in up to but **not including** check-out, so
 *     the room a guest leaves on the 24th is free the night of the 24th;
 *   - a room out of service is not booked and is not free — it is simply
 *     not for sale, and counting it offers a room nobody can sleep in;
 *   - `bookableUntil` is the last check-out this agency may book. Past
 *     it nothing is free *to them*, however empty the resort is.
 */
export function freeRoomsOn(month: AgencyResortMonth, night: string): number {
  if (month.bookableUntil && night > month.bookableUntil) return 0;
  const taken = occupancyCells(month.stays);
  return month.rooms.filter(
    (r) => r.status === "ACTIVE" && !taken.has(`${r.id}|${night}`),
  ).length;
}

/**
 * The same question for every night in a range, across every resort.
 *
 * Inclusive of both ends, because a person asking "the 21st to the 24th"
 * means all four. A range that runs backwards is not a range and gets an
 * empty answer rather than a guess at what was meant.
 */
export function freeRoomsByNight(
  months: AgencyResortMonth[],
  from: string,
  to: string,
): Map<string, number> {
  const out = new Map<string, number>();
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return out;
  if (end.getTime() < start.getTime()) return out;

  // the occupancy map is built once per resort rather than once per night,
  // which is the difference between thirty passes and one over a month
  const withTaken = months.map((m) => ({ month: m, taken: occupancyCells(m.stays) }));

  for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
    const night = iso(new Date(t));
    let free = 0;
    for (const { month, taken } of withTaken) {
      if (month.bookableUntil && night > month.bookableUntil) continue;
      for (const r of month.rooms) {
        if (r.status === "ACTIVE" && !taken.has(`${r.id}|${night}`)) free++;
      }
    }
    out.set(night, free);
  }
  return out;
}
