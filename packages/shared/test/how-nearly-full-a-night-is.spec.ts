/**
 * "Can I take a booking for the 22nd?" (2026-09-20)
 *
 * The room grid answers "who is in 103 on the 14th". This answers the
 * question a desk is asked far more often, and the rule behind it has three
 * decisions in it that are easy to get wrong in a second copy:
 *
 *   - **Nearly full is its own state.** Red and green alone say "some rooms"
 *     for both one room and nine, and one room left is exactly when a desk
 *     starts phoning people back.
 *   - **The thresholds are absolute, not proportional.** A resort with nine
 *     rooms and one left is in the same position as one with ninety and one
 *     left: the next caller is turned away either way.
 *   - **It says how many**, because "4 left" is what somebody answering the
 *     phone has to say out loud.
 *
 * The console has all three inline in a component. The phone shows the same
 * month, and two screens that disagree about when amber starts are two
 * screens that give a caller different answers.
 */
import { describe, expect, it } from "vitest";
import { TIGHT_AT, nightLoad } from "../src/index";

describe("a night with room to spare", () => {
  it("is free, and says how many are left", () => {
    expect(nightLoad(3, 10)).toEqual({ state: "free", left: 7, label: "7 left" });
  });
});

describe("a night that is nearly gone", () => {
  /**
   * Two is the line. One left and two left are both "start phoning people
   * back"; three is a normal evening.
   */
  it("turns tight at two rooms left", () => {
    expect(nightLoad(8, 10).state).toBe("tight");
    expect(nightLoad(9, 10).state).toBe("tight");
    expect(nightLoad(7, 10).state).toBe("free");
    expect(TIGHT_AT).toBe(2);
  });

  it("is absolute, not proportional — ninety rooms with two left is still tight", () => {
    expect(nightLoad(88, 90).state).toBe("tight");
    // and two of three is not, because one is still free and that is a third
    // of the resort
    expect(nightLoad(2, 3).state).toBe("tight");
  });

  it("still says the number, because that is what gets said on the phone", () => {
    expect(nightLoad(9, 10).label).toBe("1 left");
  });
});

describe("a night that is gone", () => {
  it("is full", () => {
    expect(nightLoad(10, 10)).toEqual({ state: "full", left: 0, label: "Full" });
  });

  /**
   * Overbooked. It happens — a room goes out of service after the bookings
   * were taken — and "-1 left" on a calendar helps nobody.
   */
  it("never counts below zero", () => {
    expect(nightLoad(12, 10)).toEqual({ state: "full", left: 0, label: "Full" });
  });
});

describe("a resort with nothing to sell", () => {
  /**
   * No rooms at all, or every one of them out of service. "Full" would be a
   * lie and "10 left" impossible, so the night has no state to draw.
   */
  it("has no answer rather than a wrong one", () => {
    expect(nightLoad(0, 0)).toEqual({ state: "none", left: 0, label: "—" });
  });
});
