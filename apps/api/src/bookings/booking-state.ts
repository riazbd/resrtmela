/**
 * Booking lifecycle — Sky Eco doc §4.
 * Pending → Confirmed → Checked-in → Checked-out
 *   Pending → Cancelled (declined)
 *   Confirmed → No Show | Cancelled (admin/staff only)
 */
import { ROLE, type Role } from "@rh/shared";
import type { BookingState } from "@rh/db";

export const LIVE_STATES: BookingState[] = ["PENDING", "CONFIRMED", "CHECKED_IN"];

const TRANSITIONS: Record<BookingState, BookingState[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["CHECKED_IN", "NO_SHOW", "CANCELLED"],
  CHECKED_IN: ["CHECKED_OUT"],
  CHECKED_OUT: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export const TRANSITION_ACTORS: Record<
  string,
  Role[]
> = {
  CONFIRMED: [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER, ROLE.FRONT_DESK],
  CHECKED_IN: [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER, ROLE.FRONT_DESK],
  CHECKED_OUT: [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER, ROLE.FRONT_DESK],
  NO_SHOW: [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER],
  CANCELLED: [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER, ROLE.FRONT_DESK],
};

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
