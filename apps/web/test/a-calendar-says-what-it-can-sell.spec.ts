/**
 * One colour, one meaning, on every calendar.
 *
 * Reported by the owner as "you seem to have done it backwards", and the cause
 * was worse than backwards: green meant two opposite things on the same grid. A
 * free night was `brand-50`, a pale green, and a confirmed booking was
 * `emerald-500`, a strong one. Scanning a month, the eye could not tell a night
 * that was for sale from one that was already gone — which is the only question
 * a front desk brings to a calendar.
 *
 * So: green belongs to free nights and to nothing else, and an occupied night
 * is red. State survives as the *shade* of red rather than as a different hue,
 * because "can I sell this?" has to be answerable at a glance and "who is in
 * it?" only has to be answerable on looking properly.
 *
 * The maps were also written out twice, once per calendar, which is how they
 * would have drifted apart. There is one now, and these tests are against it.
 */
import { describe, expect, it } from "vitest";
import {
  FREE_CELL,
  OCCUPIED,
  DUE_STRIPE,
  occupiedStates,
} from "@/lib/calendar-colors";

/** Tailwind's green families. Any of them on an occupied night is the bug. */
const GREEN = /\b(?:bg|text|ring|border)-(?:green|emerald|teal|lime|brand)-/;
const RED = /\bbg-red-/;

describe("a free night", () => {
  it("is green, and invites a click", () => {
    expect(FREE_CELL.idle).toMatch(GREEN);
    expect(FREE_CELL.hover).toMatch(GREEN);
  });

  it("deepens on hover rather than changing colour, so the resting state reads as the same thing", () => {
    // the owner asked for the hover colour to become the resting colour; the
    // pair has to stay in one family for that to still make sense
    expect(FREE_CELL.idle).not.toBe(FREE_CELL.hover);
  });
});

describe("an occupied night", () => {
  it("covers every state the calendar can draw", () => {
    expect(occupiedStates()).toEqual(["PENDING", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT"]);
  });

  it("is never green, whichever state it is in", () => {
    const green = occupiedStates().filter((s) => GREEN.test(OCCUPIED[s]!.fill));
    expect(green).toEqual([]);
  });

  it("is red while the room is actually held", () => {
    for (const state of ["PENDING", "CONFIRMED", "CHECKED_IN"] as const) {
      expect(OCCUPIED[state]!.fill).toMatch(RED);
    }
  });

  /**
   * Departed is the exception and deliberately so. The guest has gone and the
   * room is sellable again; painting it red would say the opposite of the one
   * thing this colour is for.
   */
  it("is grey once the guest has left, because that night is sellable again", () => {
    expect(OCCUPIED.CHECKED_OUT!.fill).toMatch(/slate/);
    expect(OCCUPIED.CHECKED_OUT!.fill).not.toMatch(RED);
  });

  it("gets darker as the stay gets more real, so the shade carries the state", () => {
    const weight = (cls: string) => Number(/-(\d{2,3})\b/.exec(cls)?.[1] ?? 0);
    expect(weight(OCCUPIED.PENDING!.fill)).toBeLessThan(weight(OCCUPIED.CONFIRMED!.fill));
    expect(weight(OCCUPIED.CONFIRMED!.fill)).toBeLessThan(weight(OCCUPIED.CHECKED_IN!.fill));
  });

  it("keeps the words, because a shade is a hint and a label is the answer", () => {
    expect(occupiedStates().map((s) => OCCUPIED[s]!.label)).toEqual([
      "Pending",
      "Confirmed",
      "In house",
      "Departed",
    ]);
  });
});

/**
 * The money stripe had to move channel. It was `bg-red-500` under a bar that is
 * now itself red, which would have made an unpaid booking look exactly like a
 * paid one — the failure being invisible rather than wrong, which is worse.
 */
describe("what is still owed", () => {
  it("is not drawn in red any more, which would now vanish into the bar", () => {
    for (const stripe of Object.values(DUE_STRIPE)) {
      expect(stripe).not.toMatch(RED);
    }
  });

  it("still separates unpaid from part-paid", () => {
    expect(DUE_STRIPE.UNPAID).toBeTruthy();
    expect(DUE_STRIPE.PARTIAL).toBeTruthy();
    expect(DUE_STRIPE.UNPAID).not.toBe(DUE_STRIPE.PARTIAL);
  });

  it("says nothing at all when the booking is paid", () => {
    expect(DUE_STRIPE.PAID).toBeUndefined();
  });
});
