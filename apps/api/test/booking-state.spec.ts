import { describe, expect, it } from "vitest";
import { canTransition, assertTransition, LIVE_STATES } from "../src/bookings/booking-state";
import { ROLE as Role } from "@rh/shared";
import { nightsBetween, eachNight, normalizePhone, round2 } from "../src/common/dates";

describe("booking state machine (doc §4)", () => {
  it("happy path", () => {
    expect(canTransition("PENDING", "CONFIRMED")).toBe(true);
    expect(canTransition("CONFIRMED", "CHECKED_IN")).toBe(true);
    expect(canTransition("CHECKED_IN", "CHECKED_OUT")).toBe(true);
  });

  it("rejects illegal transitions", () => {
    expect(canTransition("PENDING", "CHECKED_IN")).toBe(false);
    expect(canTransition("CHECKED_OUT", "CONFIRMED")).toBe(false);
    expect(canTransition("CANCELLED", "CONFIRMED")).toBe(false);
  });

  it("no-show only from Confirmed, admin/staff only", () => {
    expect(canTransition("CONFIRMED", "NO_SHOW")).toBe(true);
    expect(canTransition("CHECKED_IN", "NO_SHOW")).toBe(false);
    expect(() =>
      assertTransition("CONFIRMED", "NO_SHOW", Role.FRONT_DESK),
    ).toThrow();
    expect(() => assertTransition("CONFIRMED", "NO_SHOW", Role.MANAGER)).not.toThrow();
  });

  it("front desk can confirm and cancel, cannot no-show", () => {
    expect(() => assertTransition("PENDING", "CONFIRMED", Role.FRONT_DESK)).not.toThrow();
    expect(() => assertTransition("CONFIRMED", "CANCELLED", Role.FRONT_DESK)).not.toThrow();
  });

  it("live states block new bookings", () => {
    expect(LIVE_STATES).toEqual(["PENDING", "CONFIRMED", "CHECKED_IN"]);
  });
});

describe("date helpers", () => {
  it("nights between", () => {
    const a = new Date("2026-08-15T00:00:00Z");
    const b = new Date("2026-08-19T00:00:00Z");
    expect(nightsBetween(a, b)).toBe(4);
    expect(eachNight(a, 4)).toHaveLength(4);
  });

  it("zero/negative nights rejected upstream", () => {
    const a = new Date("2026-08-15");
    expect(nightsBetween(a, a)).toBe(0);
  });

  it("normalizes BD phones (sheet formats)", () => {
    expect(normalizePhone(" 01623-345900")).toBe("8801623345900");
    expect(normalizePhone("8801679170297")).toBe("8801679170297");
    expect(normalizePhone("1619341474")).toBe("8801619341474"); // CC-less BD mobile
  });

  it("round2 money", () => {
    expect(round2(6500.005)).toBe(6500.01);
    expect(round2(13500)).toBe(13500);
  });
});
