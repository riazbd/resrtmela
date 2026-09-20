/**
 * The six states, named once (2026-09-20).
 *
 * `["PENDING", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT", "CANCELLED",
 * "NO_SHOW"]` was written into the console's bookings page as a local
 * constant. The phone needs the same six, and a second copy of an enum is
 * how one of them ends up missing a value — which has already happened once
 * in this codebase, to the payment methods, where the restaurant's copy had
 * no BANK and a bank transfer had to be recorded as something it was not.
 *
 * It is a database enum, not a list a resort owns, so it belongs in code —
 * the accepted exception. Booking *sources* are the opposite: those are the
 * resort's own list, and the filter that hardcoded six of them is fixed in
 * the same commit.
 *
 * The label matters as much as the value. An `<option>` with no explicit
 * value sends its own text, and that is exactly how this filter once asked
 * the API for `CHECKED-IN` where the enum is `CHECKED_IN` — three of the six
 * states silently returned the wrong set.
 */
import { describe, expect, it } from "vitest";
import { BOOKING_STATES, bookingStateLabel, isBookingState } from "../src/index";

describe("the list", () => {
  it("is the six the database has, in the order a stay goes through them", () => {
    expect(BOOKING_STATES).toEqual([
      "PENDING",
      "CONFIRMED",
      "CHECKED_IN",
      "CHECKED_OUT",
      "CANCELLED",
      "NO_SHOW",
    ]);
  });
});

describe("what a person reads", () => {
  /**
   * A hyphen where the enum has an underscore is the whole reason this is a
   * function: the label and the value are different strings, and any screen
   * that lets them be the same string sends the label to the server.
   */
  it("reads CHECKED_IN as Checked-in, which is not what gets sent", () => {
    expect(bookingStateLabel("CHECKED_IN")).toBe("Checked-in");
    expect(bookingStateLabel("CHECKED_OUT")).toBe("Checked-out");
    expect(bookingStateLabel("NO_SHOW")).toBe("No-show");
  });

  it("has a word for every state, so none of them draws as a raw enum", () => {
    for (const state of BOOKING_STATES) {
      expect(bookingStateLabel(state)).not.toContain("_");
    }
  });

  /**
   * An imported booking, a state added to the database before this list was
   * updated: readable is better than blank, and blank is what a lookup table
   * gives you.
   */
  it("makes something readable out of a state it has never heard of", () => {
    expect(bookingStateLabel("ON_HOLD")).toBe("On-hold");
  });
});

describe("recognising one", () => {
  it("accepts the six", () => {
    for (const state of BOOKING_STATES) expect(isBookingState(state)).toBe(true);
  });

  it("refuses the label, which is the mistake worth catching", () => {
    expect(isBookingState("CHECKED-IN")).toBe(false);
    expect(isBookingState("Checked-in")).toBe(false);
    expect(isBookingState("")).toBe(false);
    expect(isBookingState(undefined)).toBe(false);
  });
});
