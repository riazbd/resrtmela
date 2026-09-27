/**
 * A button the server would refuse (2026-09-28).
 *
 * The API has refused most transitions to most people since bookings
 * existed — `assertTransition` throws 403 for anything `TRANSITION_ACTORS`
 * does not list. `nextStates` knew the state machine and not that rule, so
 * both clients drew buttons the server was always going to refuse:
 *
 *  - an agency was offered Confirm, Check in and Mark no-show on its own
 *    booking, which is the screen it is sent to the instant it takes one
 *  - the front desk was offered Mark no-show, which is management's
 *
 * The matrix lives beside the state machine now, so the button and the
 * refusal read the same list. This is the test that keeps them reading it.
 *
 * `role` is optional on purpose, and that is worth pinning too: a caller
 * that does not know who is looking should be told what the state allows
 * rather than nothing at all.
 */
import { describe, expect, it } from "vitest";
import { BOOKING_STATES, TRANSITION_ACTORS, nextStates } from "../src/index";

const labels = (state: string, role?: string) => nextStates(state, role).map((a) => a.to);

describe("what an agency is offered on its own booking", () => {
  it("is nothing at all, in every state", () => {
    for (const state of BOOKING_STATES) {
      expect(nextStates(state, "AGENT")).toEqual([]);
    }
  });

  /**
   * The specific three that were drawn, named so that a regression reads as
   * the bug rather than as a count.
   */
  it("is not Confirm on a pending one, nor Check in, nor Mark no-show", () => {
    expect(labels("PENDING", "AGENT")).not.toContain("CONFIRMED");
    expect(labels("CONFIRMED", "AGENT")).not.toContain("CHECKED_IN");
    expect(labels("CONFIRMED", "AGENT")).not.toContain("NO_SHOW");
  });
});

describe("what the front desk is offered", () => {
  it("includes checking a confirmed guest in", () => {
    expect(labels("CONFIRMED", "FRONT_DESK")).toContain("CHECKED_IN");
  });

  it("leaves out the no-show, which is management's to record", () => {
    expect(labels("CONFIRMED", "FRONT_DESK")).not.toContain("NO_SHOW");
    expect(labels("CONFIRMED", "MANAGER")).toContain("NO_SHOW");
  });
});

describe("the rule itself", () => {
  it("never offers a move the matrix refuses, for any role in any state", () => {
    const everyone = [...new Set(Object.values(TRANSITION_ACTORS).flat()), "AGENT", "HOUSEKEEPING"];
    for (const role of everyone) {
      for (const state of BOOKING_STATES) {
        for (const action of nextStates(state, role)) {
          expect(TRANSITION_ACTORS[action.to]).toContain(role);
        }
      }
    }
  });

  it("still answers the state's own moves when nobody is named", () => {
    expect(labels("PENDING")).toEqual(["CONFIRMED"]);
    expect(labels("CONFIRMED")).toEqual(["CHECKED_IN", "NO_SHOW"]);
  });

  it("offers nothing after a stay has ended, whoever is asking", () => {
    for (const ended of ["CHECKED_OUT", "CANCELLED", "NO_SHOW"]) {
      expect(nextStates(ended, "RESORT_ADMIN")).toEqual([]);
      expect(nextStates(ended)).toEqual([]);
    }
  });

  /** Nothing moves a booking *to* pending; it starts there. */
  it("lets nobody move a booking back to pending", () => {
    expect(TRANSITION_ACTORS.PENDING).toEqual([]);
  });
});
