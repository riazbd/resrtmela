/**
 * The three rules behind a new-booking form (2026-09-20).
 *
 * The console's form is 270 lines of JSX with these worked out inline. The
 * phone splits the same form over three pushed screens, so each rule would
 * have been written a second time — and the two clients take bookings into
 * the same calendar, so a disagreement is not a cosmetic one.
 *
 *   - **what is still missing**, which decides both the message under the
 *     button and the red rings on the fields, and so cannot be two answers;
 *   - **what the extra people cost**, which is not a rate times a count:
 *     the API fills the picked rooms one at a time, each at its own rate;
 *   - **why a room cannot be picked**, which has two reasons the grid used
 *     to draw as one.
 */
import { describe, expect, it } from "vitest";
import {
  BOOKING_GAP_MESSAGES,
  extraPersonRoom,
  roomOffer,
  whatTheBookingNeeds,
} from "../src/index";
import type { RoomAvail } from "../src/api-types";

describe("what the form still needs", () => {
  it("wants a room", () => {
    expect(whatTheBookingNeeds({ rooms: 0, guestName: "Rafiq Hasan" })).toEqual(["rooms"]);
  });

  it("wants a name", () => {
    expect(whatTheBookingNeeds({ rooms: 1, guestName: "" })).toEqual(["guestName"]);
  });

  /** A space bar is not a guest. */
  it("does not accept whitespace as a name", () => {
    expect(whatTheBookingNeeds({ rooms: 1, guestName: "   " })).toEqual(["guestName"]);
  });

  it("is quiet when the form is ready", () => {
    expect(whatTheBookingNeeds({ rooms: 2, guestName: "Rafiq Hasan" })).toEqual([]);
  });

  /**
   * Rooms first, because that is the order the form is filled in — being
   * told to name the guest before a room is picked sends somebody back up
   * the screen for nothing.
   */
  it("lists what is missing top to bottom", () => {
    expect(whatTheBookingNeeds({ rooms: 0, guestName: "" })).toEqual(["rooms", "guestName"]);
  });

  it("has something to say about each one", () => {
    for (const gap of whatTheBookingNeeds({ rooms: 0, guestName: "" })) {
      expect(BOOKING_GAP_MESSAGES[gap]).toMatch(/\S/);
    }
  });
});

const avail = (over: Partial<RoomAvail>): RoomAvail => ({
  roomId: 11,
  roomName: "1 Camellia",
  roomTypeId: 2,
  baseRate: 4500,
  status: "ACTIVE",
  busyNights: [],
  ...over,
});

describe("what an extra person costs", () => {
  /**
   * Not a rate times a count. `spreadExtraPersons` in `bookings.service.ts`
   * walks the picked rooms in order, fills each to its own maximum, and
   * charges each person at the rate of the room they end up in. A form that
   * multiplies one rate by the count shows the wrong figure the moment two
   * rooms of different sizes are picked — and the guest has been read that
   * figure out loud before the server disagrees with it.
   */
  it("fills the rooms in order, each at its own rate", () => {
    const rooms = [
      avail({ roomId: 11, extraPersonAllowed: true, extraPersonMax: 1, extraPersonRate: 500 }),
      avail({ roomId: 12, extraPersonAllowed: true, extraPersonMax: 2, extraPersonRate: 800 }),
    ];
    const room = extraPersonRoom(rooms);
    expect(room.max).toBe(3);
    expect(room.allowed).toBe(true);
    expect(room.costPerNight(1)).toBe(500);
    expect(room.costPerNight(2)).toBe(1300);
    expect(room.costPerNight(3)).toBe(2100);
  });

  it("ignores a room that does not take one", () => {
    const rooms = [
      avail({ roomId: 11, extraPersonAllowed: false, extraPersonMax: 4, extraPersonRate: 500 }),
      avail({ roomId: 12, extraPersonAllowed: true, extraPersonMax: 1, extraPersonRate: 800 }),
    ];
    const room = extraPersonRoom(rooms);
    expect(room.max).toBe(1);
    expect(room.costPerNight(1)).toBe(800);
  });

  /**
   * A resort that turned the switch on and never set a price. Charging zero
   * is what the server does, so the form must say zero rather than guess.
   */
  it("treats a missing rate as nothing", () => {
    const room = extraPersonRoom([avail({ extraPersonAllowed: true, extraPersonMax: 2 })]);
    expect(room.max).toBe(2);
    expect(room.costPerNight(2)).toBe(0);
  });

  it("has no room for anybody when nothing is picked", () => {
    const room = extraPersonRoom([]);
    expect(room.allowed).toBe(false);
    expect(room.max).toBe(0);
    expect(room.costPerNight(1)).toBe(0);
  });

  /** The box is capped at `max`, but a stale value must not invent a price. */
  it("charges no more than the rooms can hold", () => {
    const room = extraPersonRoom([
      avail({ extraPersonAllowed: true, extraPersonMax: 1, extraPersonRate: 500 }),
    ]);
    expect(room.costPerNight(9)).toBe(500);
  });

  it("charges nothing for nobody", () => {
    const room = extraPersonRoom([
      avail({ extraPersonAllowed: true, extraPersonMax: 2, extraPersonRate: 500 }),
    ]);
    expect(room.costPerNight(0)).toBe(0);
    expect(room.costPerNight(-1)).toBe(0);
  });
});

describe("why a room cannot be picked", () => {
  it("offers a free room", () => {
    expect(roomOffer(avail({}))).toEqual({ sellable: true, why: "free", note: null });
  });

  /**
   * Two reasons, drawn differently on purpose. Busy is about the dates and
   * is temporary; out of service is about the room. The grid knew only the
   * first until 2026-09-18, so a closed room looked free, and picking it
   * cost the clerk the whole form.
   */
  it("says how many nights are gone", () => {
    const offer = roomOffer(avail({ busyNights: ["2026-09-22", "2026-09-23"] }));
    expect(offer.sellable).toBe(false);
    expect(offer.why).toBe("busy");
    expect(offer.note).toBe("busy (2n)");
  });

  it("says when the room itself is shut", () => {
    const offer = roomOffer(avail({ status: "OUT_OF_SERVICE" }));
    expect(offer.sellable).toBe(false);
    expect(offer.why).toBe("closed");
    expect(offer.note).toBe("out of service");
  });

  /** Busy wins: the nights are what stands in the way *today*. */
  it("names the nights when a shut room is also booked", () => {
    const offer = roomOffer(avail({ status: "OUT_OF_SERVICE", busyNights: ["2026-09-22"] }));
    expect(offer.why).toBe("busy");
    expect(offer.note).toBe("busy (1n)");
  });
});
