/**
 * What "today" means at the desk.
 *
 * `new Date().toISOString().slice(0, 10)` is today in UTC, and the console said
 * it seven times over — the day sheet, the expense register, the restaurant,
 * activities, reports, the agency calendar and the room search. Bangladesh is
 * UTC+6, so from 18:00 local every one of those defaults jumped to tomorrow:
 * the desk opened the day sheet on a day that had not started, the expense form
 * dated the evening's fuel to tomorrow, and clicking an empty cell on the
 * calendar handed the booking form tomorrow's date. That is the shift the front
 * desk actually works.
 *
 * The resort's own timezone decides, because the resort's own day is the one
 * being counted.
 */
import { describe, expect, it } from "vitest";
import { todayIn, addDaysIso, monthOf } from "@/lib/resort-dates";

describe("todayIn", () => {
  it("is the resort's day, not the browser's", () => {
    // 20:00 on 10 Sep in Dhaka is still 14:00 UTC on the 10th
    const evening = new Date("2026-09-10T14:00:00Z");
    expect(todayIn("Asia/Dhaka", evening)).toBe("2026-09-10");
  });

  it("has already turned over when UTC has not", () => {
    // 01:00 on 11 Sep in Dhaka is 19:00 UTC on the 10th
    const lateNight = new Date("2026-09-10T19:00:00Z");
    expect(todayIn("Asia/Dhaka", lateNight)).toBe("2026-09-11");
  });

  it("has not turned over yet where the day starts later", () => {
    // the same instant is still the 10th in Honolulu
    const lateNight = new Date("2026-09-10T19:00:00Z");
    expect(todayIn("Pacific/Honolulu", lateNight)).toBe("2026-09-10");
  });

  it("falls back to UTC rather than throwing on a zone it does not know", () => {
    const noon = new Date("2026-09-10T12:00:00Z");
    expect(todayIn("Not/AZone", noon)).toBe("2026-09-10");
  });
});

describe("addDaysIso", () => {
  it("moves whole days without drifting", () => {
    expect(addDaysIso("2026-09-10", 1)).toBe("2026-09-11");
    expect(addDaysIso("2026-09-10", -1)).toBe("2026-09-09");
    expect(addDaysIso("2026-09-30", 1)).toBe("2026-10-01");
  });

  it("crosses a month end backwards", () => {
    expect(addDaysIso("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("monthOf", () => {
  it("steps months without landing in the previous one", () => {
    // `new Date(y, m, 1).toISOString()` in a positive-offset browser rolls back
    // to the previous day, and so to the previous month: the platform screen's
    // Next arrow did nothing at all in Dhaka
    expect(monthOf("2026-09", 1)).toBe("2026-10");
    expect(monthOf("2026-09", -1)).toBe("2026-08");
    expect(monthOf("2026-12", 1)).toBe("2027-01");
    expect(monthOf("2026-01", -1)).toBe("2025-12");
  });

  it("gives the last day of a month", () => {
    expect(monthOf.lastDay("2026-02")).toBe("2026-02-28");
    expect(monthOf.lastDay("2026-09")).toBe("2026-09-30");
  });
});
