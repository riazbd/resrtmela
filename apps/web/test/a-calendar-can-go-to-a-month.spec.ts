/**
 * Picking a month on a calendar.
 *
 * Both calendars could only be walked: ← Today →, a fortnight at a time. To
 * see October from August you paged four times, and to answer "how did last
 * March go" you paged backwards until you got there. There was no way to say
 * which month you meant.
 *
 * The arithmetic is small and easy to get wrong in exactly the ways that
 * matter — a month is not 30 days, February is not 28 every year, and a
 * calendar that silently lands on the 2nd is worse than one that cannot jump
 * at all. So it is a function with tests rather than an expression in JSX.
 */
import { describe, expect, it } from "vitest";
import { monthOf, monthStart, monthLength } from "../src/lib/calendar-month";

describe("the month a date belongs to", () => {
  it("is the value an <input type=month> carries", () => {
    expect(monthOf("2026-09-13")).toBe("2026-09");
    expect(monthOf("2026-01-01")).toBe("2026-01");
    expect(monthOf("2026-12-31")).toBe("2026-12");
  });
});

describe("the first day of a month", () => {
  it("is the 1st", () => {
    expect(monthStart("2026-10")).toBe("2026-10-01");
    expect(monthStart("2027-01")).toBe("2027-01-01");
  });

  it("ignores a stray day if one is passed in", () => {
    // `<input type="month">` gives `YYYY-MM`, but a bookmark or a hand-typed
    // URL can carry a whole date, and landing on the 17th of October when the
    // user asked for October is the bug this function exists to prevent
    expect(monthStart("2026-10-17")).toBe("2026-10-01");
  });

  it("refuses what is not a month", () => {
    expect(monthStart("")).toBeNull();
    expect(monthStart("October")).toBeNull();
    expect(monthStart("2026-13")).toBeNull();
    expect(monthStart("2026-00")).toBeNull();
  });
});

describe("how long a month is", () => {
  it("counts the days each one actually has", () => {
    expect(monthLength("2026-01")).toBe(31);
    expect(monthLength("2026-04")).toBe(30);
    expect(monthLength("2026-02")).toBe(28);
  });

  it("knows a leap year", () => {
    // 2028 is a leap year; 2100 is not, despite dividing by four
    expect(monthLength("2028-02")).toBe(29);
    expect(monthLength("2100-02")).toBe(28);
  });

  it("falls back to 30 rather than NaN when it cannot tell", () => {
    // a span of NaN days renders an empty grid with no error anywhere
    expect(monthLength("nonsense")).toBe(30);
  });
});
