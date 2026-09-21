/**
 * A calendar can go to any month (2026-09-21).
 *
 * Both calendars on the phone moved one month at a time and offered
 * nothing else: next March from September was six presses, and last
 * year's peak season was fourteen. Nobody does that, so in practice the
 * calendar could see the month it opened on and the two beside it. The
 * owner asked why, which is the right question — a calendar you cannot
 * navigate has one month in it.
 *
 * Both screens stepped by adding a *day* and asking which month it
 * landed in. That works for ±1 and is why it never grew: there is no
 * "back a year" you can write that way without a loop.
 *
 * The rules are here, not in a component, because they are arithmetic
 * and arithmetic about months is quietly wrong in three known ways —
 * `setMonth(getMonth() + 1)` overflows a short February, a year is not
 * twelve interchangeable things once you cross December, and a jump
 * that lands on the 2nd looks like it worked.
 */
import { describe, expect, it } from "vitest";
import { monthTitle, stepMonth } from "../src/calendar-month";

describe("stepping to another month", () => {
  it("moves one forward and one back", () => {
    expect(stepMonth("2026-09", 1)).toBe("2026-10");
    expect(stepMonth("2026-09", -1)).toBe("2026-08");
  });

  /** The one the day-arithmetic version could do; kept so it stays true. */
  it("carries into the next year over December", () => {
    expect(stepMonth("2026-12", 1)).toBe("2027-01");
    expect(stepMonth("2026-11", 2)).toBe("2027-01");
  });

  it("carries back over January", () => {
    expect(stepMonth("2026-01", -1)).toBe("2025-12");
    expect(stepMonth("2026-02", -3)).toBe("2025-11");
  });

  /** The thing the old way could not do at all without a loop. */
  it("jumps a whole year in one go, either way", () => {
    expect(stepMonth("2026-09", 12)).toBe("2027-09");
    expect(stepMonth("2026-09", -12)).toBe("2025-09");
    expect(stepMonth("2026-03", 30)).toBe("2028-09");
  });

  it("stays where it is when asked for nothing", () => {
    expect(stepMonth("2026-09", 0)).toBe("2026-09");
  });

  /**
   * A short month must not be the thing that decides the answer.
   * `setMonth(getMonth() + 1)` on 31 January gives 3 March; this never
   * touches a day at all.
   */
  it("does not care how long the month is", () => {
    expect(stepMonth("2026-01", 1)).toBe("2026-02");
    expect(stepMonth("2026-02", 1)).toBe("2026-03");
    expect(stepMonth("2024-02", 12)).toBe("2025-02");
  });

  it("gives back nonsense unchanged rather than inventing a month", () => {
    expect(stepMonth("", 1)).toBe("");
    expect(stepMonth("banana", 1)).toBe("banana");
    expect(stepMonth("2026-13", 1)).toBe("2026-13");
    expect(stepMonth("2026-00", -1)).toBe("2026-00");
  });

  /** A full ISO date is a month with a day on the end; the day is ignored. */
  it("reads a date as the month it is in", () => {
    expect(stepMonth("2026-09-22", 1)).toBe("2026-10");
  });
});

describe("what a month is called", () => {
  it("says it the way a person does", () => {
    expect(monthTitle("2026-09")).toBe("September 2026");
    expect(monthTitle("2026-01")).toBe("January 2026");
    expect(monthTitle("2026-12")).toBe("December 2026");
  });

  it("reads a date as its month", () => {
    expect(monthTitle("2026-07-04")).toBe("July 2026");
  });

  it("hands back what it cannot read, rather than a wrong month", () => {
    expect(monthTitle("2026-13")).toBe("2026-13");
    expect(monthTitle("nope")).toBe("nope");
  });
});
