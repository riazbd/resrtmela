/**
 * What a room is, and what it takes (2026-09-20).
 *
 * Two things the console's rooms table decides inline and the phone's
 * rooms tab has to decide identically — a room that reads as open on one
 * screen and shut on the other is a room somebody sells twice or not at
 * all.
 *
 * The inversion in the second one is the trap: the button says the state
 * it moves *to*, which is the opposite of the state on the badge beside
 * it. One negation at a call site and it closes the room it offers to
 * open.
 */
import { describe, expect, it } from "vitest";
import { ROOM_STATUSES, extraPersonNote, isRoomStatus, nextRoomStatus, roomStatusLabel } from "../src/index";

describe("the two states a room has", () => {
  it("has exactly two", () => {
    expect([...ROOM_STATUSES]).toEqual(["ACTIVE", "OUT_OF_SERVICE"]);
  });

  it("knows one when it sees one", () => {
    expect(isRoomStatus("ACTIVE")).toBe(true);
    expect(isRoomStatus("out_of_service")).toBe(false);
    expect(isRoomStatus(null)).toBe(false);
  });

  it("says them in words a person reads", () => {
    expect(roomStatusLabel("ACTIVE")).toBe("Active");
    expect(roomStatusLabel("OUT_OF_SERVICE")).toBe("Out of service");
  });

  /** An imported row is better shown awkwardly than shown as nothing. */
  it("does not swallow a state it has not heard of", () => {
    expect(roomStatusLabel("BEING_PAINTED")).toBe("Being painted");
  });
});

describe("the button that changes it", () => {
  /**
   * The label is the destination. A room that is open offers "Out of
   * service"; the badge beside it still says "Active", and both are right.
   */
  it("offers to shut an open room", () => {
    expect(nextRoomStatus("ACTIVE")).toEqual({ to: "OUT_OF_SERVICE", label: "Out of service" });
  });

  it("offers to open a shut one", () => {
    expect(nextRoomStatus("OUT_OF_SERVICE")).toEqual({ to: "ACTIVE", label: "Activate" });
  });

  /** Anything that is not open is shut, so the way out of it is to open it. */
  it("offers to open anything it does not recognise", () => {
    expect(nextRoomStatus("BEING_PAINTED").to).toBe("ACTIVE");
  });
});

const money = { currency: "USD", locale: "en-US", decimals: 0 };

describe("what a room takes beyond what it sleeps", () => {
  it("says how many and at what price", () => {
    expect(
      extraPersonNote(
        { extraPersonAllowed: true, extraPersonMax: 2, extraPersonRate: 500 },
        money,
      ),
    ).toBe("2 × $500/night");
  });

  it("says nothing when the room takes nobody", () => {
    expect(extraPersonNote({ extraPersonAllowed: false, extraPersonMax: 2, extraPersonRate: 500 })).toBeNull();
  });

  /**
   * The switch on and the count never set. That is not an offer, and
   * "0 × ৳500/night" invites a clerk to try selling it.
   */
  it("says nothing when the room takes nobody in particular", () => {
    expect(extraPersonNote({ extraPersonAllowed: true, extraPersonMax: 0, extraPersonRate: 500 })).toBeNull();
    expect(extraPersonNote({ extraPersonAllowed: true })).toBeNull();
  });

  /** The switch on and the price never set: free, and it should say so. */
  it("prices a free extra bed at nothing rather than hiding it", () => {
    expect(extraPersonNote({ extraPersonAllowed: true, extraPersonMax: 1 }, money)).toBe(
      "1 × $0/night",
    );
  });

  /** The API sends decimals as strings. */
  it("takes the rate as the API sends it", () => {
    expect(
      extraPersonNote({ extraPersonAllowed: true, extraPersonMax: 1, extraPersonRate: "500.00" }, money),
    ).toBe("1 × $500/night");
  });
});
