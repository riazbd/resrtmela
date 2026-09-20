/**
 * What a stay can do next (2026-09-20).
 *
 * The console holds this as `NEXT_ACTIONS`, a local map in a 1,152-line
 * page. It is the state machine the whole desk runs on — the buttons a
 * clerk is offered, and therefore the ones they are not — and the phone
 * needs exactly the same six answers.
 *
 * A second copy would not fail loudly. It would offer "Check in" on a
 * cancelled booking, or drop "Mark no-show" from the one state that can
 * reach it, and the desk would find out from a guest.
 */
import { describe, expect, it } from "vitest";
import { BOOKING_STATES, nextStates, transitionCanWait } from "../src/index";

describe("what can happen next", () => {
  it("confirms a pending booking, and nothing else", () => {
    expect(nextStates("PENDING").map((a) => a.to)).toEqual(["CONFIRMED"]);
  });

  /**
   * Two ways out of a confirmed booking, and a desk needs both by the same
   * afternoon: the guest arrived, or the guest did not.
   */
  it("lets a confirmed booking arrive or fail to", () => {
    expect(nextStates("CONFIRMED").map((a) => a.to)).toEqual(["CHECKED_IN", "NO_SHOW"]);
  });

  it("lets somebody in house leave", () => {
    expect(nextStates("CHECKED_IN").map((a) => a.to)).toEqual(["CHECKED_OUT"]);
  });

  /**
   * The three ends. Checking out issues the invoice; a cancelled booking
   * has freed its nights; a no-show is a closed case. None of them is
   * walked back from a button — that is an edit, with a reason attached.
   */
  it("offers nothing from a state that is an ending", () => {
    expect(nextStates("CHECKED_OUT")).toEqual([]);
    expect(nextStates("CANCELLED")).toEqual([]);
    expect(nextStates("NO_SHOW")).toEqual([]);
  });

  it("has an answer for every state there is", () => {
    for (const state of BOOKING_STATES) expect(Array.isArray(nextStates(state))).toBe(true);
  });

  /** An imported row, or a state added ahead of this list. */
  it("offers nothing rather than guessing at a state it does not know", () => {
    expect(nextStates("ABANDONED")).toEqual([]);
  });

  it("says what each button reads", () => {
    expect(nextStates("CONFIRMED").map((a) => a.label)).toEqual(["Check in", "Mark no-show"]);
    expect(nextStates("PENDING")[0]?.label).toBe("Confirm");
    expect(nextStates("CHECKED_IN")[0]?.label).toBe("Check out");
  });

  /**
   * No-show says a guest did not come and frees nothing a person can put
   * back with one tap, so it is asked about first. Arriving and leaving are
   * the ordinary path and are not.
   */
  it("marks the one that should be asked about twice", () => {
    const confirmed = nextStates("CONFIRMED");
    expect(confirmed.find((a) => a.to === "CHECKED_IN")?.grave).toBe(false);
    expect(confirmed.find((a) => a.to === "NO_SHOW")?.grave).toBe(true);
  });
});

describe("which of them can wait for a connection", () => {
  /**
   * A guest is standing at the counter. Check-in and check-out carry their
   * own reference, so the server recognises a replay and one queued write
   * makes one transition however many times it is sent.
   */
  it("lets an arrival and a departure be held", () => {
    expect(transitionCanWait("CHECKED_IN")).toBe(true);
    expect(transitionCanWait("CHECKED_OUT")).toBe(true);
  });

  /**
   * The rest can wait for the network instead, and should: confirming a
   * booking or marking a no-show is nobody's emergency, and a write that
   * would overwrite a colleague's change is worse held than refused.
   */
  it("makes everything else wait for the network", () => {
    expect(transitionCanWait("CONFIRMED")).toBe(false);
    expect(transitionCanWait("NO_SHOW")).toBe(false);
    expect(transitionCanWait("CANCELLED")).toBe(false);
  });
});
