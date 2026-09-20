/**
 * What `GET /bookings/:id` actually answers (2026-09-20).
 *
 * `BookingDetail extends BookingRow`, and `BookingRow` declares
 * `rooms: (string | null)[]`. The detail route has never sent a `rooms`
 * field. The console never noticed because it reads the rooms off `items`;
 * the phone's detail screen trusted the type, called `b.rooms.filter(...)`,
 * and died with "Cannot read properties of undefined (reading 'filter')" on
 * the first real booking it was pointed at. Eighteen tests were green — the
 * fixture had a `rooms` array in it, because the type said there would be
 * one.
 *
 * That is the third fixture this phase that agreed with the code instead of
 * with the server, so the fix is not just "delete the field": the rooms have
 * to come from somewhere, and `roomNames` is that somewhere, derived from
 * the items the route does send.
 *
 * The type also under-declared what the route sends: `resortId`, `roomRent`,
 * `tax`, `taxable`, `taxRatePct` and `taxLines` all arrive and none of them
 * were written down, so the tax breakdown could not be shown without a cast.
 */
import { describe, expect, it } from "vitest";
import { roomNames } from "../src/index";
import type { BookingDetail } from "../src/api-types";

type Item = BookingDetail["items"][number];

const item = (over: Partial<Item>): Item =>
  ({
    id: 1, kind: "ROOM", room: null, slot: null,
    qty: 1, unitPrice: 0, nights: 1, chargeKind: null, label: null,
    ...over,
  }) as Item;

describe("the rooms a stay is in", () => {
  it("comes off the items, because the route sends no rooms field", () => {
    const names = roomNames({
      items: [
        item({ id: 1, kind: "ROOM", room: { id: 12, name: "2 Lotus", type: "Hill Cottage" } }),
        item({ id: 2, kind: "ROOM", room: { id: 13, name: "3 Orchid", type: "Hill Cottage" } }),
      ],
    });
    expect(names).toEqual(["2 Lotus", "3 Orchid"]);
  });

  /**
   * An extra-person line carries the room it is for. Counting it would show
   * "1 Camellia, 1 Camellia" on a booking for one room.
   */
  it("counts a room once, however many lines mention it", () => {
    const names = roomNames({
      items: [
        item({ id: 1, kind: "ROOM", room: { id: 11, name: "1 Camellia", type: "D" } }),
        item({ id: 2, kind: "EXTRA_PERSON", room: { id: 11, name: "1 Camellia", type: "D" } }),
      ],
    });
    expect(names).toEqual(["1 Camellia"]);
  });

  it("ignores lines that are not about a room at all", () => {
    const names = roomNames({
      items: [
        item({ id: 1, kind: "ROOM", room: { id: 11, name: "1 Camellia", type: "D" } }),
        item({ id: 3, kind: "CHARGE", chargeKind: "DAMAGE", label: "Broken lamp" }),
        item({ id: 4, kind: "FB" }),
      ],
    });
    expect(names).toEqual(["1 Camellia"]);
  });

  /** A deleted room leaves its line behind; the bill still has to draw. */
  it("skips a line whose room is gone rather than printing a blank", () => {
    const names = roomNames({
      items: [
        item({ id: 1, kind: "ROOM", room: null }),
        item({ id: 2, kind: "ROOM", room: { id: 11, name: "1 Camellia", type: "D" } }),
      ],
    });
    expect(names).toEqual(["1 Camellia"]);
  });

  it("has nothing to say about a booking with no items", () => {
    expect(roomNames({ items: [] })).toEqual([]);
  });
});
