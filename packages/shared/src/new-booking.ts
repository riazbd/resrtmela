/**
 * The rules a new-booking form runs on.
 *
 * The console has one form, 270 lines of JSX, with all three of these
 * worked out inline. The phone splits the same form across three pushed
 * screens — dates and rooms, the guest, the money — so each rule would have
 * been written a second time, and the two clients book into one calendar.
 *
 * What they are not is validation in the usual sense. The server validates;
 * these exist so the person filling the form finds out *before* they have
 * typed a guest's name, phone and NID into a form that cannot be sent.
 */
import type { RoomAvail } from "./api-types";

/** What the form still needs, in the order the form asks for it. */
export type BookingGap = "rooms" | "guestName";

export function whatTheBookingNeeds(form: { rooms: number; guestName: string }): BookingGap[] {
  const gaps: BookingGap[] = [];
  if (form.rooms <= 0) gaps.push("rooms");
  if (!form.guestName.trim()) gaps.push("guestName");
  return gaps;
}

export const BOOKING_GAP_MESSAGES: Record<BookingGap, string> = {
  rooms: "Pick at least one room.",
  guestName: "Type the guest's name.",
};

/** How many extra people the picked rooms hold, and what they cost. */
export interface ExtraPersonRoom {
  /** Total extra places across the picked rooms. */
  max: number;
  /** Whether to offer the box at all. */
  allowed: boolean;
  /**
   * What `n` extra people add to each night's rent.
   *
   * Not a rate times a count. `spreadExtraPersons` in `bookings.service.ts`
   * walks the picked rooms in order, fills each to its own maximum, and
   * charges every person at the rate of the room they end up in. Two rooms
   * of different sizes and one multiplication is how a clerk reads a guest
   * a figure the invoice then contradicts.
   */
  costPerNight: (persons: number) => number;
}

export function extraPersonRoom(rooms: RoomAvail[]): ExtraPersonRoom {
  // one entry per place, in room order, holding the rate of the room it is
  // in — which is exactly the order the API fills them
  const places = rooms.flatMap((room) =>
    room.extraPersonAllowed
      ? Array.from({ length: room.extraPersonMax ?? 0 }, () => Number(room.extraPersonRate ?? 0))
      : [],
  );

  return {
    max: places.length,
    allowed: places.length > 0,
    costPerNight: (persons: number) => {
      if (!Number.isFinite(persons) || persons <= 0) return 0;
      return places.slice(0, Math.floor(persons)).reduce((sum, rate) => sum + rate, 0);
    },
  };
}

/** Why a room is or is not on offer for these dates. */
export interface RoomOffer {
  sellable: boolean;
  why: "free" | "busy" | "closed";
  /** What to draw beside the rate, or null when there is nothing to say. */
  note: string | null;
}

/**
 * Two reasons a room cannot be sold, and they are not the same reason.
 *
 * Busy is about the dates and is temporary: those nights are gone, the room
 * is fine. Out of service is about the room. The console's grid knew only
 * the first until 2026-09-18 — a closed room looked like any other free one,
 * and picking it cost the clerk the whole form and then failed on submit
 * with "One or more rooms missing/inactive for this resort", which names no
 * room and suggests nothing to do about it.
 *
 * Busy wins when a room is both, because the nights are what stands in the
 * way today.
 */
export function roomOffer(room: Pick<RoomAvail, "status" | "busyNights">): RoomOffer {
  const nights = room.busyNights?.length ?? 0;
  if (nights > 0) return { sellable: false, why: "busy", note: `busy (${nights}n)` };
  if (room.status !== "ACTIVE") return { sellable: false, why: "closed", note: "out of service" };
  return { sellable: true, why: "free", note: null };
}
