/**
 * The lines on a stay's bill, worked out once (2026-09-20).
 *
 * A booking's `items` are not a bill. They are four different kinds of row
 * with three different meanings of `qty`, and turning them into something a
 * guest can read takes rules that are easy to get subtly wrong:
 *
 *   - a ROOM line always has `qty: 1` — one room — and is charged per night,
 *     so its amount is `unitPrice × nights`. This spec said `qty` was the
 *     nights until 2026-09-20, the implementation agreed with it, and a
 *     three-night stay at ৳6,500 drew a bill line of ৳6,500 under a total of
 *     ৳19,500. Written from `bookings.service.ts`, where the item is created
 *     with `qty: 1`, and checked against a real booking;
 *   - an EXTRA_PERSON line's `qty` is *people × nights*, so the number of
 *     people is `qty / nights` — and the console divides by `b.nights`,
 *     which is zero on a same-day booking;
 *   - a CHARGE line's `qty` is a count of the thing, and its `chargeKind`
 *     decides whether it reads "Service", "Damage" or "Fine";
 *   - FB and ACTIVITY lines each get their own word.
 *
 * The console does all of that inline, in JSX, across four `.filter()` calls
 * in one expression. The phone needs the same bill, and a guest who is shown
 * one total at the desk and another on a phone has been overcharged by one
 * of them.
 */
import { describe, expect, it } from "vitest";
import { billLines, chargeLines } from "../src/index";
import type { BookingDetail } from "../src/api-types";

type Item = BookingDetail["items"][number];

const item = (over: Partial<Item>): Item =>
  ({
    id: 1,
    kind: "ROOM",
    room: null,
    slot: null,
    qty: 1,
    unitPrice: 0,
    nights: 1,
    chargeKind: null,
    label: null,
    ...over,
  }) as Item;

const booking = (items: Item[], nights = 2): BookingDetail =>
  ({ nights, items }) as BookingDetail;

describe("a room", () => {
  /**
   * One room, charged per night. `qty` is 1 and `nights` carries the length
   * of the stay — the API counts the `BookingNight` rows for the item.
   */
  it("charges the nightly rate for every night of the stay", () => {
    const lines = billLines(
      booking([
        item({
          id: 1, kind: "ROOM", room: { id: 16, name: "12 Shiuli", type: "Hill Cottage" },
          qty: 1, unitPrice: 6500, nights: 3,
        }),
      ], 3),
    );
    expect(lines).toEqual([
      { id: 1, kind: "ROOM", label: "12 Shiuli", detail: "৳6,500 × 3 nights", amount: 19500 },
    ]);
  });

  /**
   * An item's `nights` is `i.nights.length` — the BookingNight rows — and a
   * booking made before those rows existed, or one whose nights were
   * released, has none. The stay's own length is the better guess than one.
   */
  it("falls back to the stay's length when the item carries no nights", () => {
    const lines = billLines(
      booking([item({ id: 1, kind: "ROOM", qty: 1, unitPrice: 4500, nights: 0 })], 2),
    );
    expect(lines[0]!.amount).toBe(9000);
  });

  it("names a room that is no longer there rather than drawing a blank", () => {
    const lines = billLines(booking([item({ id: 1, kind: "ROOM", room: null, qty: 1, unitPrice: 4500, nights: 2 })]));
    expect(lines[0]!.label).toBe("Room");
  });
});

/**
 * A resort can hide its rates from the agents who sell it. The detail route
 * then sends `unitPrice: null`, and a line that quietly reads ৳0 tells the
 * agent something false about a stay they are responsible for.
 */
describe("a price the reader is not allowed to see", () => {
  it("has no amount rather than an amount of zero", () => {
    const lines = billLines(
      booking([item({ id: 1, kind: "ROOM", room: { id: 11, name: "1 Camellia", type: "D" }, qty: 1, unitPrice: null, nights: 2 })]),
    );
    expect(lines[0]!.amount).toBeNull();
    expect(lines[0]!.detail).toBeNull();
  });
});

describe("extra people", () => {
  /**
   * `qty` is people × nights. Two extra guests for two nights is `qty: 4`,
   * and a line that says "4 extra persons" is wrong by a factor of the
   * stay's length.
   */
  it("divides the quantity back into people and nights", () => {
    const lines = billLines(
      booking([
        item({
          id: 2, kind: "EXTRA_PERSON",
          room: { id: 11, name: "1 Camellia", type: "Deluxe" },
          qty: 4, unitPrice: 800,
        }),
      ], 2),
    );
    expect(lines[0]).toEqual({
      id: 2,
      kind: "EXTRA_PERSON",
      label: "Extra persons — 1 Camellia",
      detail: "2 × 2 nights",
      amount: 3200,
    });
  });

  it("says one person in the singular", () => {
    const lines = billLines(
      booking([item({ id: 2, kind: "EXTRA_PERSON", qty: 2, unitPrice: 800 })], 2),
    );
    expect(lines[0]!.label).toBe("Extra person");
    expect(lines[0]!.detail).toBe("1 × 2 nights");
  });

  /**
   * A same-day booking has zero nights, and the console divides by it.
   * `Infinity × 2 nights` is what that prints.
   */
  it("does not divide by zero on a stay with no nights", () => {
    const lines = billLines(
      booking([item({ id: 2, kind: "EXTRA_PERSON", qty: 2, unitPrice: 800 })], 0),
    );
    expect(lines[0]!.detail).not.toMatch(/Infinity|NaN/);
    expect(lines[0]!.amount).toBe(1600);
  });
});

describe("what the desk added", () => {
  it("says which of the three kinds of charge it was, and what it was for", () => {
    const lines = billLines(
      booking([
        item({ id: 3, kind: "CHARGE", chargeKind: "DAMAGE", label: "Broken lamp", qty: 1, unitPrice: 1200 }),
      ]),
    );
    expect(lines[0]).toEqual({
      id: 3, kind: "CHARGE", label: "Damage — Broken lamp", detail: null, amount: 1200,
    });
  });

  it("counts a charge taken more than once", () => {
    const lines = billLines(
      booking([
        item({ id: 3, kind: "CHARGE", chargeKind: "SERVICE", label: "Laundry", qty: 3, unitPrice: 300 }),
      ]),
    );
    expect(lines[0]!.detail).toBe("× 3");
    expect(lines[0]!.amount).toBe(900);
  });

  /** An imported charge, or one whose kind the database grew later. */
  it("still says Charge for a kind it has never heard of", () => {
    const lines = billLines(
      booking([item({ id: 3, kind: "CHARGE", chargeKind: "MYSTERY", label: "Something", qty: 1, unitPrice: 50 })]),
    );
    expect(lines[0]!.label).toBe("Charge — Something");
  });
});

describe("the restaurant and the activities", () => {
  it("says Restaurant for a food bill posted to the room", () => {
    const lines = billLines(booking([item({ id: 4, kind: "FB", qty: 1, unitPrice: 850 })]));
    expect(lines[0]!.label).toBe("Restaurant");
  });

  it("names the activity somebody booked", () => {
    const lines = billLines(
      booking([
        item({
          id: 5, kind: "ACTIVITY", qty: 2, unitPrice: 600,
          slot: { id: 3, name: "Sunrise kayak", startsAt: "2026-09-21T05:30:00.000Z", endsAt: "2026-09-21T07:00:00.000Z" },
        }),
      ]),
    );
    expect(lines[0]!.label).toBe("Sunrise kayak");
    expect(lines[0]!.amount).toBe(1200);
  });
});

describe("the whole bill", () => {
  it("keeps the rooms first, because that is what the stay is", () => {
    const lines = billLines(
      booking([
        item({ id: 3, kind: "CHARGE", chargeKind: "FINE", label: "Smoking", qty: 1, unitPrice: 2000 }),
        item({ id: 1, kind: "ROOM", room: { id: 11, name: "1 Camellia", type: "D" }, qty: 2, unitPrice: 4500 }),
        item({ id: 2, kind: "EXTRA_PERSON", qty: 2, unitPrice: 800 }),
      ], 2),
    );
    expect(lines.map((l) => l.kind)).toEqual(["ROOM", "EXTRA_PERSON", "CHARGE"]);
  });

  /**
   * A line with no price is a data fault, not a reason to crash — and it
   * must not silently become part of a total either.
   */
  it("never puts NaN on a bill", () => {
    const lines = billLines(booking([item({ id: 1, kind: "CHARGE", label: "Odd", qty: Number.NaN, unitPrice: 50 })]));
    expect(lines[0]!.amount).toBe(0);
  });

  it("has nothing to say about a booking with no items", () => {
    expect(billLines(booking([]))).toEqual([]);
  });
});

/**
 * The charge lines on their own (2026-09-20).
 *
 * The departure screen lists what has been put on the bill beyond the
 * stay, so each line can be taken off again before the invoice is issued.
 * The console exports this from `stay-desk.tsx`; the phone's check-out
 * screen needs the same list, and "which of these is removable" is not a
 * question two screens should answer differently.
 */
describe("what was charged beyond the stay", () => {
  const stay = (items: Item[]) =>
    ({ items, nights: 2 }) as Pick<BookingDetail, "items" | "nights">;

  it("picks out the charges and leaves the stay alone", () => {
    const lines = chargeLines(
      stay([
        item({ id: 1, kind: "ROOM", unitPrice: 6500 }),
        item({ id: 2, kind: "CHARGE", chargeKind: "DAMAGE", label: "Broken lamp", unitPrice: 800 }),
        item({ id: 3, kind: "FB", label: "Restaurant", unitPrice: 450 }),
      ]),
    );
    expect(lines.map((l) => l.id)).toEqual([2]);
  });

  /** A bill with nothing added is the normal case, not an error. */
  it("is empty when nothing was added", () => {
    expect(chargeLines(stay([item({ kind: "ROOM" })]))).toEqual([]);
  });
});
