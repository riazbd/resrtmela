/**
 * Whether a room has been cleaned, and which one to clean next.
 *
 * `HOUSEKEEPING` has been a role since phase 0 and `permissionsFor`
 * answered it with an empty array, so an owner could add a housekeeper,
 * hand them a password, and that person would sign in to nothing at
 * all. This is the first code that role has ever had.
 *
 * **Three states, not four.** `DIRTY → CLEANING → CLEAN`. Larger hotels
 * run a fourth — the supervisor's INSPECTED tick — and it was the first
 * thing this was tempted by. At a twelve-room resort the person cleaning
 * and the person checking are the same person, and a state nobody sets
 * makes the other three harder to read. It can be added when somebody
 * asks; it cannot easily be taken away once every room carries one.
 */

/** A database enum, so it is declared in code — the accepted exception. */
export const HOUSEKEEPING_STATES = ["DIRTY", "CLEANING", "CLEAN"] as const;

export type HousekeepingState = (typeof HOUSEKEEPING_STATES)[number];

export function isHousekeepingState(value: unknown): value is HousekeepingState {
  return typeof value === "string" && (HOUSEKEEPING_STATES as readonly string[]).includes(value);
}

/**
 * What a person reads.
 *
 * "Ready" and not "Clean", because the question the desk is actually
 * asking is whether the room can be sold, and "clean" invites the reply
 * "clean enough?".
 */
export function housekeepingLabel(state: string): string {
  if (state === "DIRTY") return "Needs cleaning";
  if (state === "CLEANING") return "Being cleaned";
  if (state === "CLEAN") return "Ready";
  // an imported row, or a state added ahead of this list
  return state.charAt(0) + state.slice(1).toLowerCase();
}

/**
 * The other state, and the words for the button that gets there.
 *
 * **The label is the destination, not the state the room is in.**
 * `room-status.ts` records getting exactly that backwards, which is why
 * this is written down rather than worked out at each call site.
 *
 * A clean room can be sent back to dirty, because somebody taps the
 * wrong row and has to undo it — and because a room that was cleaned
 * yesterday and stood open all day is not ready.
 */
export function nextHousekeepingState(state: string): { to: HousekeepingState; label: string } {
  if (state === "DIRTY") return { to: "CLEANING", label: "Start cleaning" };
  if (state === "CLEANING") return { to: "CLEAN", label: "Mark ready" };
  return { to: "DIRTY", label: "Needs cleaning" };
}

/** A room, as the housekeeping list needs to see it. */
export interface HousekeepingRoom {
  id: number;
  name: string;
  housekeeping: string;
  /** a guest checked out of it today — it is this morning's work */
  departedToday: boolean;
  /** somebody arrives into it tonight — it is this morning's *urgent* work */
  arrivingToday: boolean;
}

/**
 * How urgent a room is, lowest first.
 *
 * A housekeeper on the second floor holding a mop does not read a list;
 * they read the top of one. So the room whose guest left this morning
 * with somebody arriving into it tonight comes first, and a room that is
 * already clean comes last because it is done.
 *
 * State outranks urgency: every dirty room sits above every room being
 * cleaned, however pressing. Somebody is already on the second one.
 */
function urgency(room: HousekeepingRoom): number {
  if (room.housekeeping === "DIRTY") {
    if (room.departedToday && room.arrivingToday) return 0;
    if (room.departedToday) return 1;
    return 2;
  }
  if (room.housekeeping === "CLEANING") return 3;
  return 4;
}

/**
 * The rooms in the order they should be worked through.
 *
 * Stable, and it leaves its argument alone: rooms the rules cannot
 * separate keep the order the server sent, which is `byRoomName` — so
 * the list reads 1, 2, 3, 10 and not 1, 10, 2.
 */
export function housekeepingOrder<T extends HousekeepingRoom>(rooms: readonly T[]): T[] {
  return rooms
    .map((room, at) => ({ room, at }))
    .sort((a, b) => urgency(a.room) - urgency(b.room) || a.at - b.at)
    .map(({ room }) => room);
}
