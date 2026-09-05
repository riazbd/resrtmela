import { describe, expect, it } from "vitest";
import { expandSchedules, slotDateTime, remainingSeats } from "../src/activities/schedule";

const FRI = 5, SAT = 6;

describe("activity schedule expansion", () => {
  const sched = [
    { weekday: FRI, startTime: "10:00", endTime: "11:00", capacity: 12, active: true },
    { weekday: SAT, startTime: "16:00", endTime: "17:30", capacity: 8, active: true },
  ];

  // Sun 2026-08-23 .. Sat 2026-08-29 (inclusive window [from, to) = 23rd..30th)
  it("expands Fri+Sat rows into 2 slots in one week", () => {
    const out = expandSchedules(sched, new Date("2026-08-23"), new Date("2026-08-30"));
    expect(out).toHaveLength(2);
    expect(out[0]!.date.toISOString().slice(0, 10)).toBe("2026-08-28"); // Fri
    expect(out[1]!.date.toISOString().slice(0, 10)).toBe("2026-08-29"); // Sat
  });

  it("inactive schedules are skipped", () => {
    const out = expandSchedules(
      sched.map((s) => ({ ...s, active: false })),
      new Date("2026-08-23"), new Date("2026-08-30"),
    );
    expect(out).toHaveLength(0);
  });

  it("two-per-day capacity rows double up", () => {
    const out = expandSchedules(
      [sched[0]!, { ...sched[0]!, startTime: "18:00", endTime: "19:00" }],
      new Date("2026-08-28"), new Date("2026-08-29"),
    );
    expect(out).toHaveLength(2);
  });

  it("slotDateTime combines date + HH:MM", () => {
    expect(slotDateTime(new Date("2026-08-28"), "10:30").toISOString()).toBe("2026-08-28T10:30:00.000Z");
    expect(slotDateTime(new Date("2026-08-28"), "9:05").toISOString()).toBe("2026-08-28T09:05:00.000Z");
  });

  it("remaining floors at zero", () => {
    expect(remainingSeats(12, 5)).toBe(7);
    expect(remainingSeats(12, 12)).toBe(0);
    expect(remainingSeats(12, 15)).toBe(0);
  });
});
