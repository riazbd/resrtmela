/**
 * "Can I sell the 22nd?" — the only question an agent asks a calendar.
 *
 * The console draws the agency calendar as a grid: a row per room, a
 * column per night, across every resort. A phone cannot, and should not
 * try — four inches will not hold eighty rooms across thirty nights, and
 * an agent on the phone is not auditing occupancy. They have somebody in
 * front of them asking about a date.
 *
 * So the phone asks the grid one question per night and shows the
 * answer. The counting is here rather than in the screen for the reason
 * every rule in this package is: the console and the phone must not
 * disagree about whether a room is free, and a second implementation is
 * how they start to.
 *
 * Two things the count has to get right, and both are already settled
 * elsewhere in this file: a stay holds check-in up to but **not
 * including** check-out, and a room that is out of service is not free —
 * it is simply not for sale.
 */
import { describe, expect, it } from "vitest";
import { freeRoomsOn, freeRoomsByNight } from "../src/agency-calendar";
import type { AgencyResortMonth } from "../src/api-types";

const month = (over: Partial<AgencyResortMonth> = {}): AgencyResortMonth => ({
  resort: { id: 3, name: "Demo Bay Resort", location: "Cox's Bazar" },
  bookableUntil: null,
  rooms: [
    { id: 1, name: "1 Camellia", roomTypeId: 1, roomTypeName: "Deluxe", status: "ACTIVE", baseRate: 6500 },
    { id: 2, name: "2 Lotus", roomTypeId: 1, roomTypeName: "Deluxe", status: "ACTIVE", baseRate: 7500 },
    { id: 3, name: "3 Orchid", roomTypeId: 2, roomTypeName: "Cottage", status: "ACTIVE", baseRate: 5500 },
  ],
  stays: [],
  ...over,
});

const stay = (roomId: number, checkIn: string, checkOut: string) => ({
  roomId,
  checkIn,
  checkOut,
  mine: false,
  state: "CONFIRMED",
  guestName: null,
  code: null,
  bookingId: null,
  paymentState: null,
});

describe("how many rooms are free that night", () => {
  it("is every sellable room when nobody is staying", () => {
    expect(freeRoomsOn(month(), "2026-09-22")).toBe(3);
  });

  it("does not count a room somebody is in", () => {
    const m = month({ stays: [stay(1, "2026-09-21", "2026-09-24")] });
    expect(freeRoomsOn(m, "2026-09-22")).toBe(2);
  });

  /**
   * The rule the whole calendar turns on. A guest leaving on the 24th
   * frees that room for the night of the 24th, and a count that says
   * otherwise turns a customer away from an empty room.
   */
  it("counts the room a guest leaves on the morning of their check-out", () => {
    const m = month({ stays: [stay(1, "2026-09-21", "2026-09-24")] });
    expect(freeRoomsOn(m, "2026-09-24")).toBe(3);
  });

  it("counts the room again the night before somebody arrives", () => {
    const m = month({ stays: [stay(1, "2026-09-25", "2026-09-27")] });
    expect(freeRoomsOn(m, "2026-09-24")).toBe(3);
  });

  /**
   * Out of service is not booked, and it is not free either. Counting it
   * as free offers a room that cannot be slept in.
   */
  it("leaves out a room that is not for sale at all", () => {
    const m = month();
    m.rooms[2].status = "OUT_OF_SERVICE";
    expect(freeRoomsOn(m, "2026-09-22")).toBe(2);
  });

  it("is none when every room is taken", () => {
    const m = month({
      stays: [
        stay(1, "2026-09-22", "2026-09-23"),
        stay(2, "2026-09-22", "2026-09-23"),
        stay(3, "2026-09-22", "2026-09-23"),
      ],
    });
    expect(freeRoomsOn(m, "2026-09-22")).toBe(0);
  });

  /**
   * A resort may stop selling to agencies after a date — a wedding it
   * has taken directly, a season it keeps for itself. Past that, nothing
   * is free *to this agency*, however empty the rooms are.
   */
  it("is none past the date the resort stops selling to agencies", () => {
    const m = month({ bookableUntil: "2026-09-23" });
    expect(freeRoomsOn(m, "2026-09-22")).toBe(3);
    expect(freeRoomsOn(m, "2026-09-23")).toBe(3);
    expect(freeRoomsOn(m, "2026-09-24")).toBe(0);
  });
});

describe("the month, night by night", () => {
  it("answers for every night asked about, and only those", () => {
    const m = month({ stays: [stay(1, "2026-09-22", "2026-09-24")] });
    const nights = freeRoomsByNight([m], "2026-09-21", "2026-09-24");
    expect([...nights.keys()]).toEqual([
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
    ]);
    expect(nights.get("2026-09-21")).toBe(3);
    expect(nights.get("2026-09-22")).toBe(2);
    expect(nights.get("2026-09-23")).toBe(2);
    expect(nights.get("2026-09-24")).toBe(3);
  });

  it("adds up across the resorts an agency sells", () => {
    const one = month({ stays: [stay(1, "2026-09-22", "2026-09-23")] });
    const two = month({
      resort: { id: 5, name: "Sky Eco Resort", location: "Sajek" },
      rooms: [
        { id: 9, name: "Hill 1", roomTypeId: 4, roomTypeName: "Hill", status: "ACTIVE", baseRate: 6500 },
      ],
    });
    const nights = freeRoomsByNight([one, two], "2026-09-22", "2026-09-22");
    expect(nights.get("2026-09-22")).toBe(3);
  });

  it("is an empty answer, not a crash, when the agency sells nothing", () => {
    const nights = freeRoomsByNight([], "2026-09-22", "2026-09-23");
    expect(nights.get("2026-09-22")).toBe(0);
    expect(nights.get("2026-09-23")).toBe(0);
  });

  it("says nothing at all about a range that runs backwards", () => {
    expect(freeRoomsByNight([month()], "2026-09-24", "2026-09-22").size).toBe(0);
  });
});
