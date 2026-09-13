/**
 * What a calendar's colours mean, defined once.
 *
 * The owner reported the calendars as "backwards". They were worse than
 * backwards: green meant two opposite things on the same grid. A free night
 * was `brand-50`, a pale green; a confirmed booking was `emerald-500`, a strong
 * one. Both read as "green — fine", and the one question a front desk brings to
 * a calendar is *can I sell this night*, which the colours could not answer.
 *
 * The rule now is single-valued:
 *
 * - **Green is free, and nothing else is green.**
 * - **Red is held**, and the shade says how firmly. Pending is the palest
 *   because it is the least committed; in-house is the deepest because somebody
 *   is physically in the room. "Can I sell it?" is answered at a glance; "who
 *   is in it?" only has to survive a proper look, and the bar still carries the
 *   word.
 * - **Departed is grey**, because the guest has gone and that night is sellable
 *   again. Painting it red would say the opposite of what red is for here.
 *
 * These maps were previously written out twice, once in each calendar screen,
 * which is how two calendars come to disagree about what a colour means. One
 * definition, both screens.
 *
 * Tailwind class strings, so this is the console's and not shared: React Native
 * has no classes. What the phone will share is the *rule* above, not these
 * strings.
 */

export type OccupiedState = "PENDING" | "CONFIRMED" | "CHECKED_IN" | "CHECKED_OUT";

export interface CellLook {
  fill: string;
  text: string;
  label: string;
}

/**
 * A night nobody has taken.
 *
 * `idle` is what used to be the hover colour: the owner asked for the resting
 * state to carry it, because an untinted cell read as missing rather than as
 * free. Hovering now deepens within the same family instead of introducing a
 * colour, so the cell never changes meaning under the cursor.
 */
export const FREE_CELL = {
  idle: "bg-brand-50 ring-1 ring-inset ring-brand-100",
  hover: "hover:bg-brand-100 hover:ring-brand-400",
} as const;

export const OCCUPIED: Record<OccupiedState, CellLook> = {
  PENDING: { fill: "bg-red-100", text: "text-red-900", label: "Pending" },
  CONFIRMED: { fill: "bg-red-200", text: "text-red-900", label: "Confirmed" },
  // the deepest of the three, and the only one where the text needs the
  // contrast of a near-black rather than the family's own dark
  CHECKED_IN: { fill: "bg-red-400", text: "text-red-950", label: "In house" },
  CHECKED_OUT: { fill: "bg-slate-200", text: "text-slate-700", label: "Departed" },
};

/**
 * What is still owed, as a stripe under the bar.
 *
 * Payment was once a *colour* — an orange block — which meant a partly paid
 * confirmed booking had to choose between showing its state and showing its
 * money. Two facts, two channels: the fill says where the stay is, the stripe
 * says what is outstanding.
 *
 * The stripe used to be `bg-red-500`, which worked while the bars were green
 * and would now be a red line on a red bar — an unpaid booking looking exactly
 * like a settled one. Invisible is worse than wrong, so the stripe moved off
 * the hue the fill now owns. Slate for unpaid, amber for part-paid: darker is
 * more owed, and both read against every fill above.
 */
export const DUE_STRIPE: Record<string, string> = {
  UNPAID: "bg-slate-900",
  PARTIAL: "bg-amber-500",
};

/** The states a calendar can draw, in the order a stay moves through them. */
export function occupiedStates(): OccupiedState[] {
  return ["PENDING", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT"];
}
