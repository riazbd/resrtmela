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

/** One button a clerk is offered on a booking, and what pressing it means. */
export interface NextState {
  to: BookingState;
  /** What the button reads. Sentence case, like every other label here. */
  label: string;
  /**
   * Worth asking about twice. A no-show says a guest did not come and is
   * not walked back with one tap; arriving and leaving are the ordinary
   * path through a stay and asking about those is noise at a counter.
   */
  grave: boolean;
}

/**
 * The state machine the whole desk runs on.
 *
 * It lived as `NEXT_ACTIONS`, a local map inside the console's 1,152-line
 * bookings page, until the phone needed the same six answers. What it
 * decides is which buttons a clerk is offered — and therefore which they
 * are not — so a second copy would not fail loudly: it would offer "Check
 * in" on a cancelled booking, or drop "Mark no-show" from the one state
 * that can reach it, and the desk would find out from a guest.
 *
 * The three endings offer nothing. Checking out issues the invoice, a
 * cancelled booking has already freed its nights, and a no-show is a
 * closed case; walking any of them back is an edit with a reason
 * attached, not a button.
 *
 * Cancelling is deliberately not here. It is reachable from every live
 * state, it frees nights, and it belongs with the other destructive
 * actions rather than among the ordinary next steps.
 */
const NEXT: Record<BookingState, NextState[]> = {
  PENDING: [{ to: "CONFIRMED", label: "Confirm", grave: false }],
  CONFIRMED: [
    { to: "CHECKED_IN", label: "Check in", grave: false },
    { to: "NO_SHOW", label: "Mark no-show", grave: true },
  ],
  CHECKED_IN: [{ to: "CHECKED_OUT", label: "Check out", grave: false }],
  CHECKED_OUT: [],
  CANCELLED: [],
  NO_SHOW: [],
};

/**
 * Who may move a booking *to* each state.
 *
 * The API has enforced this since bookings existed — `assertTransition`
 * refuses anything not listed here with a 403 — and neither client knew it.
 * So the app drew "Confirm", "Check in" and "Mark no-show" for an agency,
 * every one of which the server refuses, on the very screen an agent is sent
 * to the moment they take a booking. An agency's way out of a booking is to
 * ask the resort (`requestCancel`), which is not a transition at all.
 *
 * It lives here now for the reason the state machine above does: a rule the
 * server enforces and the client guesses at is a rule the client will guess
 * wrong. The API imports this rather than keeping a second copy.
 *
 * Roles are the fixed enum, so a resort unticking "Cancel bookings" for a
 * front-desk user changes nothing here — that is the permission matrix's
 * job, checked separately and after this.
 */
export const TRANSITION_ACTORS: Record<BookingState, string[]> = {
  CONFIRMED: ["SUPER_ADMIN", "RESORT_ADMIN", "MANAGER", "FRONT_DESK"],
  CHECKED_IN: ["SUPER_ADMIN", "RESORT_ADMIN", "MANAGER", "FRONT_DESK"],
  CHECKED_OUT: ["SUPER_ADMIN", "RESORT_ADMIN", "MANAGER", "FRONT_DESK"],
  NO_SHOW: ["SUPER_ADMIN", "RESORT_ADMIN", "MANAGER"],
  CANCELLED: ["SUPER_ADMIN", "RESORT_ADMIN", "MANAGER", "FRONT_DESK"],
  // nothing moves a booking *to* PENDING; it starts there
  PENDING: [],
};

/**
 * The buttons this person is offered on a booking in this state.
 *
 * `role` is optional because the rule it adds is a narrowing, and a caller
 * that does not know who is looking is better off being told what the state
 * allows than being told nothing. Every caller that does know passes it.
 */
export function nextStates(state: string, role?: string): NextState[] {
  // an imported row, or a state added to the database ahead of this list:
  // offering nothing is the only honest answer
  const ahead = isBookingState(state) ? NEXT[state] : [];
  if (role === undefined) return ahead;
  return ahead.filter((action) => TRANSITION_ACTORS[action.to].includes(role));
}

/**
 * Whether this transition may be held until the network returns.
 *
 * The answer is about replay safety and about who is waiting. A guest is
 * standing at the counter for an arrival and a departure, and both carry
 * their own reference, so the server recognises a replay and one queued
 * write makes one transition however many times it is sent.
 *
 * Nothing else on a booking is anybody's emergency, and a write that would
 * quietly overwrite a colleague's change is better refused than held.
 */
export function transitionCanWait(to: string): boolean {
  return to === "CHECKED_IN" || to === "CHECKED_OUT";
}
