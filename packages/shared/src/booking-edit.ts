/**
 * Changing a booking after it was made.
 *
 * `PATCH /bookings/:id` has taken dates, head count, discount and remarks
 * all along, and for a long time nothing called it — so a guest staying a
 * night longer meant cancelling and booking again, losing the payment
 * ledger with it.
 *
 * Two of its rules live only in `bookings.service.ts`, enforced with a 409
 * the clerk meets *after* filling the form in. Both are here now, so a
 * client can decline to offer what the server will refuse:
 *
 *   - an agent and a front desk may edit only before the guest arrives;
 *   - an agent may not touch the discount at all.
 *
 * And the patch itself: only what moved is sent. Two of those comparisons
 * are easy to get wrong, and both are written down below.
 */
import type { DiscountKind } from "./discount";

/** The states in which anybody at the desk may still change a booking. */
export const EDITABLE_BEFORE_ARRIVAL = ["PENDING", "CONFIRMED"] as const;

/** Roles the API lets edit a booking at any point in the stay. */
const EDITS_AT_ANY_POINT = ["SUPER_ADMIN", "RESORT_ADMIN", "MANAGER"];

/** Roles that may edit, but only until the guest is in the room. */
const EDITS_BEFORE_ARRIVAL = ["FRONT_DESK", "AGENT"];

export interface EditVerdict {
  allowed: boolean;
  /** Why not, in the words to put on the screen. Null when it is allowed. */
  why: string | null;
  /** An agent is quoted the resort's terms; they do not set them. */
  mayChangeDiscount: boolean;
}

/**
 * Whether this person may change this booking now.
 *
 * Separate from the permission check, which asks whether they may edit
 * bookings at all. This asks whether *this* booking, in *this* state, is
 * still theirs to change — and the answer for a front desk stops the
 * moment the guest walks into the room.
 *
 * An unrecognised role is refused. A screen that guesses "probably fine"
 * about a permission is a screen that offers a form the server throws
 * away.
 */
export function canEditStay({ role, state }: { role: string; state: string }): EditVerdict {
  if (EDITS_AT_ANY_POINT.includes(role)) {
    return { allowed: true, why: null, mayChangeDiscount: true };
  }

  if (EDITS_BEFORE_ARRIVAL.includes(role)) {
    const early = (EDITABLE_BEFORE_ARRIVAL as readonly string[]).includes(state);
    return {
      allowed: early,
      why: early ? null : "Only before the guest arrives — ask a manager to change this one.",
      // an agent is quoted the resort's terms; they do not set them, and
      // the API refuses a patch that carries one from them
      mayChangeDiscount: early && role !== "AGENT",
    };
  }

  return { allowed: false, why: "You cannot change a booking.", mayChangeDiscount: false };
}

/** A booking as it stands, in the fields an edit can move. */
export interface StayAsItStands {
  /** Full ISO from the API; only the civil date is compared. */
  checkIn: string | null;
  checkOut: string | null;
  adults: number;
  children: number;
  /** What the discount came to, in money. */
  discount: number;
  discountKind: string | null;
  /** What was typed: a percentage stays a percentage. */
  discountValue?: number | null;
  remarks: string | null;
}

/** The same fields as a form holds them: civil dates, no nulls. */
export interface StayAsEdited {
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  discount: number;
  discountKind: DiscountKind;
  remarks: string;
}

export interface BookingPatch {
  checkIn?: string;
  checkOut?: string;
  adults?: number;
  children?: number;
  discount?: number;
  discountKind?: DiscountKind;
  remarks?: string;
}

/** Both shapes the API sends a date in — see `dayLabel` for the same problem. */
const civil = (value: string | null) => (value ? value.slice(0, 10) : "");

/**
 * What to send, which is only what moved.
 *
 * Sending everything would work — the API compares the dates itself — but
 * it would also mean a save that re-prices every night of a stay whose
 * dates nobody touched, and a patch nobody can read in a log.
 *
 * Two comparisons carry a note because both have a wrong answer that
 * looks right:
 *
 *   - **a date** arrives as `2026-09-22T00:00:00.000Z` and is edited as
 *     `2026-09-22`. Comparing the strings makes every save move the dates;
 *   - **a percentage discount** keeps what was typed in `discountValue`
 *     beside what it came to in `discount`. Comparing against the money
 *     makes "10%" look changed on every save of a booking that costs
 *     anything at all.
 *
 * The two discount fields travel together whenever either moves, because
 * the API refuses a change of kind that does not say the new figure.
 */
export function bookingChanges(
  now: StayAsItStands,
  edited: StayAsEdited,
  options: { mayChangeDiscount?: boolean } = {},
): BookingPatch {
  const patch: BookingPatch = {};

  if (edited.checkIn !== civil(now.checkIn)) patch.checkIn = edited.checkIn;
  if (edited.checkOut !== civil(now.checkOut)) patch.checkOut = edited.checkOut;
  if (edited.adults !== now.adults) patch.adults = edited.adults;
  if (edited.children !== now.children) patch.children = edited.children;
  if (edited.remarks !== (now.remarks ?? "")) patch.remarks = edited.remarks;

  if (options.mayChangeDiscount !== false) {
    // what was typed, falling back to the money for a booking made before
    // the two were kept apart
    const typed = now.discountValue ?? now.discount;
    const kind = now.discountKind ?? "FLAT";
    if (edited.discount !== typed || edited.discountKind !== kind) {
      patch.discount = edited.discount;
      patch.discountKind = edited.discountKind;
    }
  }

  return patch;
}
