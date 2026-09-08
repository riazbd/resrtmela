import { describe, expect, it } from "vitest";
import { bookingTotals, perNightRevenue } from "../src/common/money";

const IN = new Date("2026-08-15T00:00:00Z");
const OUT = new Date("2026-08-18T00:00:00Z"); // 3 nights

const room = (unitPrice: number, qty = 1) => ({ itemKind: "ROOM" as const, unitPrice, qty });
const fb = (unitPrice: number) => ({ itemKind: "FB" as const, unitPrice, qty: 1 });
const extra = (unitPrice: number, qty: number) => ({ itemKind: "EXTRA_PERSON" as const, unitPrice, qty });
const activity = (unitPrice: number, qty: number) => ({ itemKind: "ACTIVITY" as const, unitPrice, qty });
const paid = (amount: number) => ({ paymentType: "ADVANCE" as const, amount });
const refund = (amount: number) => ({ paymentType: "REFUND" as const, amount });

describe("bookingTotals — room rent", () => {
  it("multiplies room rate by nights", () => {
    const t = bookingTotals({ items: [room(5000)], payments: [], discount: 0, checkIn: IN, checkOut: OUT });
    expect(t.nights).toBe(3);
    expect(t.roomRent).toBe(15000);
    expect(t.rent).toBe(15000);
  });

  it("multiplies every room of a multi-room booking by nights", () => {
    const t = bookingTotals({ items: [room(5000), room(4000)], payments: [], discount: 0, checkIn: IN, checkOut: OUT });
    expect(t.roomRent).toBe(27000);
  });

  it("treats a room with no stay dates as a single night", () => {
    const t = bookingTotals({ items: [room(5000)], payments: [], discount: 0, checkIn: null, checkOut: null });
    expect(t.roomRent).toBe(5000);
  });
});

describe("bookingTotals — non-room items are never multiplied by nights", () => {
  it("charges an F&B bill once, not once per night", () => {
    const t = bookingTotals({ items: [room(5000), fb(900)], payments: [], discount: 0, checkIn: IN, checkOut: OUT });
    expect(t.rent).toBe(15900);
    expect(t.roomRent).toBe(15000);
  });

  it("charges extra persons once — qty already carries the nights", () => {
    // bookRoomsTx stores qty = extraPersons * nights
    const t = bookingTotals({ items: [room(5000), extra(500, 2 * 3)], payments: [], discount: 0, checkIn: IN, checkOut: OUT });
    expect(t.rent).toBe(18000);
  });

  it("charges an activity by its own qty", () => {
    const t = bookingTotals({ items: [room(5000), activity(1200, 2)], payments: [], discount: 0, checkIn: IN, checkOut: OUT });
    expect(t.rent).toBe(17400);
  });
});

describe("bookingTotals — due and payment state", () => {
  it("subtracts discount and payments from rent", () => {
    const t = bookingTotals({ items: [room(5000)], payments: [paid(4000)], discount: 2500, checkIn: IN, checkOut: OUT });
    expect(t.due).toBe(8500); // 15000 - 2500 - 4000
    expect(t.paid).toBe(4000);
    expect(t.paymentState).toBe("PARTIAL");
  });

  it("reports UNPAID when nothing was collected", () => {
    const t = bookingTotals({ items: [room(5000)], payments: [], discount: 0, checkIn: IN, checkOut: OUT });
    expect(t.paymentState).toBe("UNPAID");
    expect(t.due).toBe(15000);
  });

  it("reports PAID once the due is cleared", () => {
    const t = bookingTotals({ items: [room(5000)], payments: [paid(15000)], discount: 0, checkIn: IN, checkOut: OUT });
    expect(t.paymentState).toBe("PAID");
    expect(t.due).toBe(0);
  });

  it("keeps refunds out of the paid total and reports them separately", () => {
    const t = bookingTotals({ items: [room(5000)], payments: [paid(15000), refund(5000)], discount: 0, checkIn: IN, checkOut: OUT });
    expect(t.paid).toBe(15000);
    expect(t.refunded).toBe(5000);
  });

  it("accepts Prisma Decimal-shaped values as strings", () => {
    const t = bookingTotals({
      items: [{ itemKind: "ROOM", unitPrice: "5000.00", qty: 1 }],
      payments: [{ paymentType: "ADVANCE", amount: "4000.00" }],
      discount: "2500.00",
      checkIn: IN,
      checkOut: OUT,
    });
    expect(t.due).toBe(8500);
  });
});

describe("perNightRevenue — the Day Sheet / sheet tab 11 rule", () => {
  it("spreads rent minus discount evenly across the nights of the stay", () => {
    // sheet-verified: BK-00003 6500 - 2500 -> 4000 for a one-night stay
    expect(perNightRevenue(6500, 2500, 1)).toBe(4000);
    expect(perNightRevenue(15000, 3000, 3)).toBe(4000);
  });

  it("never divides by zero nights", () => {
    expect(perNightRevenue(5000, 0, 0)).toBe(5000);
  });
});

describe("tax", () => {
  it("charges nothing when the resort has no tax rate set", () => {
    const t = bookingTotals({ items: [room(5000)], payments: [], discount: 0, checkIn: IN, checkOut: OUT });
    expect(t.tax).toBe(0);
    expect(t.total).toBe(15000);
    expect(t.due).toBe(15000);
  });

  it("taxes the amount after discount, not the gross rent", () => {
    const t = bookingTotals({
      items: [room(5000)], payments: [], discount: 5000,
      checkIn: IN, checkOut: OUT, taxRatePct: 15,
    });
    expect(t.taxable).toBe(10000); // 15000 - 5000
    expect(t.tax).toBe(1500);
    expect(t.total).toBe(11500);
  });

  it("adds tax to what the guest still owes", () => {
    const t = bookingTotals({
      items: [room(5000)], payments: [paid(5000)], discount: 0,
      checkIn: IN, checkOut: OUT, taxRatePct: 15,
    });
    expect(t.tax).toBe(2250); // 15% of 15000
    expect(t.total).toBe(17250);
    expect(t.due).toBe(12250); // 17250 - 5000
  });

  it("taxes food and activities along with the room", () => {
    const t = bookingTotals({
      items: [room(5000), fb(900), activity(1000, 2)], payments: [], discount: 0,
      checkIn: IN, checkOut: OUT, taxRatePct: 10,
    });
    expect(t.taxable).toBe(17900); // 15000 + 900 + 2000
    expect(t.tax).toBe(1790);
  });

  it("rounds tax to paisa", () => {
    const t = bookingTotals({
      items: [room(3333)], payments: [], discount: 0,
      checkIn: IN, checkOut: new Date("2026-08-16T00:00:00Z"), taxRatePct: 7.5,
    });
    expect(t.tax).toBe(249.98); // 3333 * 0.075 = 249.975
  });

  it("never reports a negative taxable amount when the discount exceeds the rent", () => {
    const t = bookingTotals({
      items: [room(5000)], payments: [], discount: 99999,
      checkIn: IN, checkOut: OUT, taxRatePct: 15,
    });
    expect(t.taxable).toBe(0);
    expect(t.tax).toBe(0);
  });
});
