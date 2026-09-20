/**
 * Which nights a stay holds, and what a colour on a calendar means.
 *
 * `apps/web/src/lib/calendar-colors.ts` states the rule and then writes it in
 * Tailwind classes, ending with a note that the phone would share the rule
 * and not the strings. This is the rule.
 *
 * The owner reported the calendars as "backwards". They were worse than
 * backwards — green meant two opposite things on the same grid — and the one
 * question a front desk brings to a calendar is *can I sell this night*. So:
 *
 *   - **Green is free, and nothing else is green.**
 *   - **Red is held**, and the shade says how firmly: pending is the palest
 *     because it is the least committed, in-house the deepest because
 *     somebody is physically in the room.
 *   - **Departed is grey.** The guest has gone and the night is sellable
 *     again; painting it red would say the opposite of what red is for here.
 *
 * Each client picks its own colours from `firmness`, because a Tailwind class
 * and a React Native style are not the same object — but the ordering, the
 * words and the arithmetic are one copy.
 */
import type { CalendarBooking } from "./api-types";

/** The four states that actually hold a room for a night. */
export const HELD_STATES = ["PENDING", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] as const;

export type HeldState = (typeof HELD_STATES)[number];

export function isHeldState(value: unknown): value is HeldState {
  return typeof value === "string" && (HELD_STATES as readonly string[]).includes(value);
}

export interface NightMeaning {
  /** What a person reads on the bar. */
  label: string;
  /**
   * How firmly the night is held, 1–3. A client turns this into a shade; the
   * order is the rule and the shades are that client's business.
   */
  firmness: 1 | 2 | 3;
  /** The guest has left: the night is sellable, so it is not drawn as held. */
  gone: boolean;
}

export const NIGHT_MEANING: Record<HeldState, NightMeaning> = {
  PENDING: { label: "Pending", firmness: 1, gone: false },
  CONFIRMED: { label: "Confirmed", firmness: 2, gone: false },
  CHECKED_IN: { label: "In house", firmness: 3, gone: false },
  CHECKED_OUT: { label: "Departed", firmness: 1, gone: true },
};

/** Both shapes the API sends a date in — see `dayLabel` for the same problem. */
const civil = (value: string) => value.slice(0, 10);

/**
 * `roomId|YYYY-MM-DD` → the stay holding that room that night.
 *
 * A stay holds from `checkIn` up to but **not including** `checkOut`.
 * Checkout morning is a night the resort can sell that evening, and a grid
 * that paints it red turns guests away from an empty room.
 *
 * A room the API reports as `{ id: null }` — one that was deleted after the
 * booking was made — is skipped rather than keyed on null, which would put
 * every such stay in the same cell.
 */
export function nightsHeld(
  bookings: CalendarBooking[],
  days: string[],
): Map<string, CalendarBooking> {
  const held = new Map<string, CalendarBooking>();
  for (const booking of bookings) {
    const from = civil(booking.checkIn);
    const to = civil(booking.checkOut);
    for (const day of days) {
      if (day < from || day >= to) continue;
      for (const room of booking.rooms) {
        if (room.id === null) continue;
        held.set(`${room.id}|${day}`, booking);
      }
    }
  }
  return held;
}

/**
 * How many sellable rooms are taken each day.
 *
 * The caller passes only the rooms that can be sold: a room under maintenance
 * belongs on the grid — a desk that cannot see it cannot tell "not bookable"
 * from "does not exist" — but it is not occupancy, in the numerator or the
 * denominator.
 */
export function occupancyOf(
  days: string[],
  sellableRoomIds: number[],
  held: Map<string, CalendarBooking>,
): { day: string; taken: number }[] {
  return days.map((day) => ({
    day,
    taken: sellableRoomIds.reduce((n, id) => n + (held.has(`${id}|${day}`) ? 1 : 0), 0),
  }));
}

/**
 * How nearly gone a night is, and what to say about it.
 *
 * The room grid answers "who is in 103 on the 14th". This answers the
 * question a desk is asked far more often — "can I take a booking for the
 * 22nd" — and it carries three decisions worth stating once:
 *
 *   - **Nearly full is its own state.** Red and green alone say "some rooms"
 *     for both one room and nine, and one room left is exactly when a desk
 *     starts phoning people back.
 *   - **The thresholds are absolute, not proportional.** Nine rooms with one
 *     left and ninety with one left are the same position: the next caller
 *     is turned away either way.
 *   - **It says how many.** "4 left" is what somebody answering the phone
 *     has to say out loud; "some availability" is not.
 */
export const TIGHT_AT = 2;

export type NightLoadState = "free" | "tight" | "full" | "none";

export interface NightLoad {
  state: NightLoadState;
  /** Rooms still sellable that night. Never below zero, however overbooked. */
  left: number;
  /** What to draw under the date. */
  label: string;
}

export function nightLoad(taken: number, sellable: number): NightLoad {
  // no rooms at all, or every one out of service: "Full" would be a lie and
  // "10 left" impossible, so there is nothing to say
  if (sellable <= 0) return { state: "none", left: 0, label: "—" };
  // overbooking happens — a room goes out of service after the bookings were
  // taken — and "-1 left" on a calendar helps nobody
  const left = Math.max(0, sellable - taken);
  if (left === 0) return { state: "full", left, label: "Full" };
  if (left <= TIGHT_AT) return { state: "tight", left, label: `${left} left` };
  return { state: "free", left, label: `${left} left` };
}
