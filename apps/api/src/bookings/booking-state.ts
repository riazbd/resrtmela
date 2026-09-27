/**
 * Booking lifecycle — Sky Eco doc §4.
 * Pending → Confirmed → Checked-in → Checked-out
 *   Pending → Cancelled (declined)
 *   Confirmed → No Show | Cancelled (admin/staff only)
 */
import { TRANSITION_ACTORS, type Role } from "@rh/shared";
import type { BookingState } from "@rh/db";

export { TRANSITION_ACTORS };

export const LIVE_STATES: BookingState[] = ["PENDING", "CONFIRMED", "CHECKED_IN"];

const TRANSITIONS: Record<BookingState, BookingState[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["CHECKED_IN", "NO_SHOW", "CANCELLED"],
  CHECKED_IN: ["CHECKED_OUT"],
  CHECKED_OUT: [],
  CANCELLED: [],
  NO_SHOW: [],
};

/*
 * `TRANSITION_ACTORS` moved to `@rh/shared` on 2026-09-28 and is re-exported
 * above. It decided which buttons the API would accept while both clients
 * guessed at the same question and one of them guessed wrong — the app drew
 * Confirm, Check in and Mark no-show for an agency, and the server refused
 * every press with a 403. A rule the server enforces and the client cannot
 * read is a rule the client will get wrong.
 */

export function canTransition(from: BookingState, to: BookingState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: BookingState, to: BookingState, role: Role): void {
  if (!canTransition(from, to)) {
    throw Object.assign(
      new Error(`Invalid transition ${from} → ${to}`),
      { status: 409 },
    );
  }
  if (!TRANSITION_ACTORS[to]?.includes(role)) {
    throw Object.assign(new Error(`Role ${role} cannot move booking to ${to}`), {
      status: 403,
    });
  }
}
