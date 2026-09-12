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
import { monthOf, monthStart, monthLength, isWeekend, startsTheWeek, monthGrid } from "../src/lib/calendar-month";

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

describe("the week, as Bangladesh keeps it", () => {
  it("has its weekend on Friday and Saturday", () => {
    /**
     * Both calendars had Thursday and Friday. Bangladesh moved its weekend to
     * Friday and Saturday in 2009 — the working week is Sunday to Thursday —
     * so a resort's busiest nights were being marked on the wrong two columns,
     * and the rate plans people build around them read one day early.
     */
    expect(isWeekend("2026-09-18")).toBe(true); // Friday
    expect(isWeekend("2026-09-19")).toBe(true); // Saturday
    expect(isWeekend("2026-09-17")).toBe(false); // Thursday — a working day
    expect(isWeekend("2026-09-20")).toBe(false); // Sunday — the week starts
  });

  it("starts the week on Sunday, which is where the hairline goes", () => {
    // the grid draws a line where the week turns over; it was on Saturday,
    // which is now the second day of the weekend rather than the first of the week
    expect(startsTheWeek("2026-09-20")).toBe(true); // Sunday
    expect(startsTheWeek("2026-09-19")).toBe(false); // Saturday
  });
});

describe("the month laid out as weeks", () => {
  it("starts every row on a Sunday, padding the first one", () => {
    // 1 Oct 2026 is a Thursday, so the first row carries four blanks
    const weeks = monthGrid("2026-10");
    expect(weeks[0]!.slice(0, 5)).toEqual([null, null, null, null, "2026-10-01"]);
    expect(weeks[0]!).toHaveLength(7);
  });

  it("holds every day of the month, once", () => {
    const days = monthGrid("2026-10").flat().filter(Boolean);
    expect(days).toHaveLength(31);
    expect(days[0]).toBe("2026-10-01");
    expect(days[30]).toBe("2026-10-31");
    expect(new Set(days).size).toBe(31);
  });

  it("pads the last row too, so the grid is rectangular", () => {
    for (const month of ["2026-02", "2026-10", "2027-01"]) {
      for (const week of monthGrid(month)) expect(week).toHaveLength(7);
    }
  });

  it("handles a February that starts on a Sunday without an empty first row", () => {
    // 1 Feb 2026 is a Sunday: no padding at all
    expect(monthGrid("2026-02")[0]![0]).toBe("2026-02-01");
  });

  it("counts a leap February", () => {
    expect(monthGrid("2028-02").flat().filter(Boolean)).toHaveLength(29);
  });
});
