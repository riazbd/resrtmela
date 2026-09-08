import { describe, expect, it } from "vitest";
import { todayIn, civilDateIn } from "../src/common/dates";

/**
 * "Today" is a civil date in the resort's timezone, not a UTC one.
 *
 * The old today() read UTC components, so between midnight and 06:00 in Dhaka
 * it returned yesterday — every night, on the arrivals list and the check-in
 * reminder sweep.
 */
const at = (iso: string) => new Date(iso);

describe("today in a resort's timezone", () => {
  it("is the local date during the hours UTC is still on yesterday", () => {
    // 03:11 on 9 Sep in Dhaka is still 8 Sep in UTC
    const now = at("2026-09-08T21:11:00Z");
    expect(civilDateIn("Asia/Dhaka", now)).toBe("2026-09-09");
    expect(todayIn("Asia/Dhaka", now).toISOString().slice(0, 10)).toBe("2026-09-09");
  });

  it("agrees with UTC during the rest of the day", () => {
    const now = at("2026-09-09T12:00:00Z"); // 18:00 Dhaka
    expect(civilDateIn("Asia/Dhaka", now)).toBe("2026-09-09");
  });

  it("returns midnight, matching how date columns are stored", () => {
    const d = todayIn("Asia/Dhaka", at("2026-09-08T21:11:00Z"));
    expect(d.toISOString()).toBe("2026-09-09T00:00:00.000Z");
  });

  it("handles a timezone behind UTC", () => {
    // 21:00 on 8 Sep in New York is already 9 Sep in UTC
    const now = at("2026-09-09T01:00:00Z");
    expect(civilDateIn("America/New_York", now)).toBe("2026-09-08");
    expect(civilDateIn("UTC", now)).toBe("2026-09-09");
  });

  it("handles a half-hour offset", () => {
    const now = at("2026-09-08T19:00:00Z"); // 00:30 on 9 Sep in Kathmandu
    expect(civilDateIn("Asia/Kathmandu", now)).toBe("2026-09-09");
  });

  it("falls back to UTC rather than throwing on an unknown timezone", () => {
    const now = at("2026-09-08T21:11:00Z");
    expect(civilDateIn("Not/AZone", now)).toBe("2026-09-08");
  });
});
