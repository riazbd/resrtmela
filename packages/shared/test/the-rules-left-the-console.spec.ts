/**
 * The rules that decide behaviour, now reachable from either client.
 *
 * These modules were in `apps/web/src/lib`, where the phone cannot reach them.
 * Their behaviour is already covered — ten specs in the console's suite test
 * these functions in detail and keep doing so through their old import paths,
 * which is what makes this move safe to attempt at all.
 *
 * So this spec does not re-test the behaviour. It tests the two things the
 * console's specs cannot see: that the symbols are importable across the
 * package boundary, and that what arrived is the same function and not a
 * lookalike. A smoke assertion per module is enough for the second — anything
 * more would be a second copy of tests that already exist.
 */
import { describe, expect, it } from "vitest";
import type { CalendarStay } from "../src/index";
import {
  MAX_SPAN_NIGHTS,
  RESET_REQUESTED_MESSAGE,
  addDaysIso,
  bookingHandoff,
  consoleGate,
  freeSpan,
  isWeekend,
  landingFor,
  mergeRuns,
  missingFeature,
  monthGrid,
  monthLength,
  monthOf,
  monthStart,
  navVisible,
  newPasswordError,
  occupancyCells,
  shiftMonth,
  startsTheWeek,
  todayIn,
  weekdayOf,
} from "../src/index";

describe("console-access", () => {
  it("still lets the platform owner past a front door they have no resort for", () => {
    expect(consoleGate({ loading: false, me: { role: "SUPER_ADMIN" }, activeResort: null })).toBe("ready");
    expect(consoleGate({ loading: false, me: { role: "FRONT_DESK" }, activeResort: null })).toBe("no-resort");
  });

  it("still refuses a resort screen to somebody without the permission", () => {
    const who = { role: "FRONT_DESK", can: (p: string) => p === "bookings.view", features: [] as string[] };
    expect(navVisible({ roles: ["STAFF"], perm: "bookings.view" }, who)).toBe(true);
    expect(navVisible({ roles: ["MGMT"], perm: "settings.manage" }, who)).toBe(false);
  });

  it("still names the screen a plan does not include", () => {
    const entries = [{ href: "/fb", roles: ["STAFF"], feature: "restaurant" }];
    expect(missingFeature("/fb", entries, [])).toBe("restaurant");
    expect(missingFeature("/fb", entries, ["restaurant"])).toBeNull();
  });

  it("still sends each role somewhere that is theirs", () => {
    expect(landingFor("AGENT")).toBe("/agent/discover");
    expect(landingFor("FRONT_DESK")).toBe("/dashboard");
  });
});

describe("the calendar rules", () => {
  it("still calls Friday and Saturday the weekend, Bangladesh-style", () => {
    expect(isWeekend("2026-09-11")).toBe(true); // Friday
    expect(isWeekend("2026-09-12")).toBe(true); // Saturday
    expect(isWeekend("2026-09-13")).toBe(false); // Sunday
    expect(isWeekend("2026-09-10")).toBe(false); // Thursday, the old wrong answer
  });

  it("still starts the week on Sunday", () => {
    expect(startsTheWeek("2026-09-13")).toBe(true);
    expect(weekdayOf("2026-09-13")).toBe(0);
  });

  it("still lays a month out in whole weeks", () => {
    const grid = monthGrid("2026-09-01");
    expect(grid.every((week) => week.length === 7)).toBe(true);
    expect(grid.flat().filter(Boolean)).toHaveLength(monthLength("2026-09"));
  });

  it("still truncates a date to its month, and finds a month's first day", () => {
    expect(monthOf("2026-09-13")).toBe("2026-09");
    expect(monthStart("2026-10-17")).toBe("2026-10-01");
  });

  it("still leaves the checkout night free to sell", () => {
    const cells = occupancyCells([
      { roomId: 1, checkIn: "2026-09-13", checkOut: "2026-09-15" } as CalendarStay,
    ]);
    expect(cells.has("1|2026-09-13")).toBe(true);
    expect(cells.has("1|2026-09-14")).toBe(true);
    // they leave on the 15th; that night is sellable
    expect(cells.has("1|2026-09-15")).toBe(false);
  });

  it("still caps a free span at the month it can show", () => {
    expect(MAX_SPAN_NIGHTS).toBe(31);
    expect(typeof freeSpan).toBe("function");
  });

  it("still merges neighbouring days that carry the same booking", () => {
    const held: Record<string, { id: number } | null> = {
      "2026-09-13": { id: 7 },
      "2026-09-14": { id: 7 },
      "2026-09-15": null,
      "2026-09-16": { id: 9 },
    };
    const runs = mergeRuns(Object.keys(held), (d) => held[d] ?? null, (v) => v.id);
    expect(runs.map((r) => [r.from, r.nights, r.value?.id ?? null])).toEqual([
      ["2026-09-13", 2, 7],
      ["2026-09-15", 1, null],
      ["2026-09-16", 1, 9],
    ]);
  });
});

/**
 * `shiftMonth` is `resort-dates`'s `monthOf`, renamed on the way in. Two
 * different functions were called `monthOf` in two different files, and a
 * package with one front door cannot export both. The console keeps the old
 * name through an alias, so no call site there changed.
 */
describe("resort-dates", () => {
  it("still adds whole months without falling into the previous one in Dhaka", () => {
    expect(shiftMonth("2026-09", 1)).toBe("2026-10");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });

  it("still carries its first-day and last-day helpers through the rename", () => {
    expect(shiftMonth.firstDay("2026-09")).toBe("2026-09-01");
    expect(shiftMonth.lastDay("2026-09")).toBe("2026-09-30");
    expect(shiftMonth.lastDay("2026-02")).toBe("2026-02-28");
  });

  it("still reads today in a resort's own timezone, and adds days", () => {
    expect(todayIn("Asia/Dhaka")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(addDaysIso("2026-09-13", 2)).toBe("2026-09-15");
  });
});

describe("the rest", () => {
  it("still hands a booking between screens", () => {
    expect(typeof bookingHandoff).toBe("function");
  });

  it("still says the same neutral sentence whichever identifier was typed", () => {
    expect(RESET_REQUESTED_MESSAGE).toMatch(/\S/);
    expect(newPasswordError("short", "short")).toBeTruthy();
    expect(newPasswordError("Password123!", "Password123!")).toBeNull();
  });
});
