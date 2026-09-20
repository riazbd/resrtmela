/**
 * What a room is, and what it takes.
 *
 * Two small things the console's rooms table works out inline, and the
 * phone's rooms tab has to work out identically or a room reads as open on
 * one screen and shut on the other.
 *
 * The first is a two-valued enum with a verb attached: a room is sellable
 * or it is not, and the button says the state it moves *to*, which is the
 * opposite of the state it shows. That inversion is the kind of thing a
 * second copy gets backwards.
 *
 * The second is the extra-person line. It moved off the room *type* in
 * September because one type covers rooms of different sizes and so could
 * not answer "does this one take a third person, and at what price" — the
 * note has to come off the room, and a client reading the type instead is
 * reading a field that is no longer the truth.
 */
import type { Room } from "./api-types";
import { formatMoney, type MoneyFormat } from "./money";

/** A database enum, so it is declared in code — the accepted exception. */
export const ROOM_STATUSES = ["ACTIVE", "OUT_OF_SERVICE"] as const;

export type RoomStatus = (typeof ROOM_STATUSES)[number];

export function isRoomStatus(value: unknown): value is RoomStatus {
  return typeof value === "string" && (ROOM_STATUSES as readonly string[]).includes(value);
}

/** What a person reads. Sentence case, as everywhere else. */
export function roomStatusLabel(status: string): string {
  if (status === "ACTIVE") return "Active";
  if (status === "OUT_OF_SERVICE") return "Out of service";
  // an imported row, or a value added ahead of this list
  return status
    .split("_")
    .map((w, i) => (i === 0 ? w.charAt(0) + w.slice(1).toLowerCase() : w.toLowerCase()))
    .join(" ");
}

/**
 * The other state, and the words for the button that gets there.
 *
 * The label is the destination, not the current state — "Out of service"
 * on a room that is *currently* active. Written down because reading it
 * off `status` at the call site is one negation away from a button that
 * closes the room it says it is opening.
 */
export function nextRoomStatus(status: string): { to: RoomStatus; label: string } {
  return status === "ACTIVE"
    ? { to: "OUT_OF_SERVICE", label: "Out of service" }
    : { to: "ACTIVE", label: "Activate" };
}

/**
 * "2 × ৳500/night", or null when this room takes nobody extra.
 *
 * Read off the room and never off its type. `extraPersonAllowed` with a
 * maximum of zero is a resort that turned the switch on and never said how
 * many — which is not an offer, so it reads as none.
 */
export function extraPersonNote(
  room: Pick<Room, "extraPersonAllowed" | "extraPersonMax" | "extraPersonRate">,
  money: MoneyFormat = {},
): string | null {
  const max = room.extraPersonMax ?? 0;
  if (!room.extraPersonAllowed || max <= 0) return null;
  const rate = formatMoney(room.extraPersonRate ?? 0, { ...money, decimals: 0 });
  return `${max} × ${rate}/night`;
}
