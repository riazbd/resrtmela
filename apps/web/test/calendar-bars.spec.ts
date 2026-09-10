/**
 * A stay is one bar, not a row of squares.
 *
 * Both calendars drew every night as its own cell, so a three-night booking was
 * three disconnected blocks and the guest's name was crammed into each of them
 * at 9px and truncated — a wall of unreadable letter fragments that is most of
 * why the grid reads as noise. Merged into a run, the same stay is one bar with
 * the width of the whole stay to write a name in, and the eye can follow a
 * booking across the month without counting squares.
 *
 * The merging is arithmetic, so it lives here with its tests rather than inside
 * a component, the way `occupancyCells` already does.
 */
import { describe, expect, it } from "vitest";
import { mergeRuns } from "@/lib/calendar-bars";

const DAYS = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"];

/** `at` for a booking covering `nights`, identified by `id`. */
const stay = (id: number, nights: string[]) => (day: string) =>
  nights.includes(day) ? { id } : null;

describe("merging nights into bars", () => {
  it("makes one bar of a stay that runs three nights", () => {
    const runs = mergeRuns(DAYS, stay(7, ["2026-11-02", "2026-11-03", "2026-11-04"]), (v) => v.id);

    expect(runs).toEqual([
      { from: "2026-11-01", nights: 1, value: null },
      { from: "2026-11-02", nights: 3, value: { id: 7 } },
      { from: "2026-11-05", nights: 1, value: null },
    ]);
  });

  it("keeps two different stays apart even when they touch", () => {
    const at = (day: string) =>
      day <= "2026-11-02" ? { id: 1 } : day <= "2026-11-04" ? { id: 2 } : null;

    const runs = mergeRuns(DAYS, at, (v) => v.id);

    expect(runs.map((r) => [r.value?.id ?? null, r.nights])).toEqual([
      [1, 2],
      [2, 2],
      [null, 1],
    ]);
  });

  it("merges the free nights between stays into one run", () => {
    const runs = mergeRuns(DAYS, stay(7, ["2026-11-01"]), (v) => v.id);

    expect(runs).toEqual([
      { from: "2026-11-01", nights: 1, value: { id: 7 } },
      { from: "2026-11-02", nights: 4, value: null },
    ]);
  });

  it("splits a stay that leaves and comes back", () => {
    // the same booking on either side of a night it does not hold: two bars,
    // because one bar would paint over a night that is free to sell
    const runs = mergeRuns(DAYS, stay(7, ["2026-11-01", "2026-11-04"]), (v) => v.id);

    expect(runs.map((r) => [r.value?.id ?? null, r.from, r.nights])).toEqual([
      [7, "2026-11-01", 1],
      [null, "2026-11-02", 2],
      [7, "2026-11-04", 1],
      [null, "2026-11-05", 1],
    ]);
  });

  it("covers the month exactly, however it is cut up", () => {
    const runs = mergeRuns(DAYS, stay(7, ["2026-11-02", "2026-11-03"]), (v) => v.id);

    expect(runs.reduce((s, r) => s + r.nights, 0)).toBe(DAYS.length);
  });

  it("gives an empty month one free run rather than nothing", () => {
    const runs = mergeRuns(DAYS, () => null, () => 0);

    expect(runs).toEqual([{ from: "2026-11-01", nights: 5, value: null }]);
  });

  it("has nothing to say about no days at all", () => {
    expect(mergeRuns([], () => null, () => 0)).toEqual([]);
  });
});
