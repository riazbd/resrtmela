/**
 * Turning what the API sends into something a person reads (2026-09-20).
 *
 * The API sends a booking's dates two different ways and always has. The day
 * sheet answers `date: "2026-09-20"`, a bare civil date; a booking row
 * answers `checkIn: "2026-09-21T00:00:00.000Z"`, because that column is a
 * `DateTime` and Nest serialises it whole. Nothing in the types says which
 * is which — both are `string`.
 *
 * The phone's bookings list assumed the first shape, appended a time to it,
 * and drew "Invalid Date → Invalid Date" over eight real bookings. The unit
 * tests passed: the fixture had been written to match the code rather than
 * the server.
 *
 * The second half of the problem is the zone. These dates are stored at UTC
 * midnight, so rendering them in the *reader's* zone moves them a day for
 * anybody west of Greenwich. A stay does not start a day earlier because the
 * person looking at it is in New York, so the formatting is pinned to UTC.
 */
import { describe, expect, it } from "vitest";
import { dayLabel, stayRange } from "../src/index";

describe("the two shapes the API sends", () => {
  it("reads a bare civil date, as the day sheet sends it", () => {
    expect(dayLabel("2026-09-21")).toBe("21 Sep");
  });

  /** The shape that drew "Invalid Date" over the whole bookings list. */
  it("reads a full timestamp, as a booking row sends it", () => {
    expect(dayLabel("2026-09-21T00:00:00.000Z")).toBe("21 Sep");
  });

  it("reads a Date, since three call sites already had one", () => {
    expect(dayLabel(new Date("2026-09-21T00:00:00.000Z"))).toBe("21 Sep");
  });
});

describe("the zone", () => {
  /**
   * Midnight UTC is the previous evening in every western zone. A booking
   * that checks in on the 21st must not read as the 20th because the person
   * holding the phone is in New York.
   */
  it("does not move the day for a reader west of Greenwich", () => {
    expect(dayLabel("2026-09-21T00:00:00.000Z")).toBe("21 Sep");
    expect(dayLabel("2026-01-01T00:00:00.000Z", { style: "full" })).toBe("01 Jan 26");
  });
});

describe("the two lengths", () => {
  it("leaves the year off by default, because a list is mostly this year", () => {
    expect(dayLabel("2026-09-21")).toBe("21 Sep");
  });

  it("carries the year where one date stands alone", () => {
    expect(dayLabel("2026-09-21", { style: "full" })).toBe("21 Sep 26");
  });

  it("spells the whole thing out where the screen is about one day", () => {
    expect(dayLabel("2026-09-20", { style: "long" })).toBe("Sunday, 20 September 2026");
  });
});

describe("what it does with nothing", () => {
  /**
   * An em dash, not an empty string and not "Invalid Date". A booking with
   * no dates is a real row — an import that had none — and it must draw as
   * a gap rather than as a fault.
   */
  it("draws an em dash for a date that is not there", () => {
    expect(dayLabel(null)).toBe("—");
    expect(dayLabel(undefined)).toBe("—");
    expect(dayLabel("")).toBe("—");
  });

  it("draws an em dash rather than the words Invalid Date", () => {
    expect(dayLabel("not a date")).toBe("—");
    expect(dayLabel("2026-13-45")).toBe("—");
  });
});

/**
 * A stay as one phrase (2026-09-20).
 *
 * Added when the phone's last booking step turned out to say the room and
 * the nights and nothing about who or when — read back off a screenshot,
 * not off a test. Two full dates take a line each on a phone and are read
 * as two separate facts; a stay is one fact.
 */
describe("a stay, from one day to another", () => {
  it("names the month once when both days are in it", () => {
    expect(stayRange("2026-09-22", "2026-09-24")).toBe("22–24 Sep");
  });

  /**
   * Spaced when the parts have spaces in them, closed up when they do not
   * — the ordinary typesetting rule, and the reason "30 Sep–2 Oct" reads
   * as one mangled word.
   */
  it("names both months when the stay crosses one", () => {
    expect(stayRange("2026-09-30", "2026-10-02")).toBe("30 Sep – 2 Oct");
  });

  it("names the year only when the stay crosses one", () => {
    expect(stayRange("2026-12-30", "2027-01-02")).toBe("30 Dec 2026 – 2 Jan 2027");
  });

  /** A booking row sends full ISO; a day sheet sends a bare civil date. */
  it("takes either shape the API sends", () => {
    expect(stayRange("2026-09-22T00:00:00.000Z", "2026-09-24T00:00:00.000Z")).toBe("22–24 Sep");
  });

  it("says nothing it cannot say", () => {
    expect(stayRange(null, "2026-09-24")).toBe("—");
    expect(stayRange("2026-09-22", undefined)).toBe("—");
  });
});
