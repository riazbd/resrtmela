import { describe, expect, it } from "vitest";
import { bookingTotals, fbBillTotals, perNightRevenue, type TaxRule } from "../src/common/money";

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

  /**
   * Money that went back is money the guest no longer owes us — or rather,
   * money we are owed again.
   *
   * `refunded` was computed and then dropped: `due` was `total - paid`, with
   * `paid` the gross taken. So refunding a stay in full left it reading PAID
   * with nothing outstanding, and every report counted the returned money as
   * collected. The test above pinned how a refund is *represented* and never
   * asked what it *means*, which is why the defect survived in the one file
   * the whole product treats as the source of truth for money.
   *
   * `paid` stays gross on purpose: a ledger that shows "paid 15,000, refunded
   * 5,000, due 5,000" tells the front desk what happened. One that shows
   * "paid 10,000" hides it.
   */
  it("adds a refund back to what is owed", () => {
    const t = bookingTotals({ items: [room(5000)], payments: [paid(15000), refund(5000)], discount: 0, checkIn: IN, checkOut: OUT });
    expect(t.due).toBe(5000);
    expect(t.paymentState).toBe("PARTIAL");
  });

  it("returns a fully refunded stay to unpaid", () => {
    const t = bookingTotals({ items: [room(5000)], payments: [paid(15000), refund(15000)], discount: 0, checkIn: IN, checkOut: OUT });
    expect(t.due).toBe(15000);
    expect(t.paymentState).toBe("UNPAID");
  });

  it("still settles a stay that was paid and never refunded", () => {
    const t = bookingTotals({ items: [room(5000)], payments: [paid(15000)], discount: 0, checkIn: IN, checkOut: OUT });
    expect(t.due).toBe(0);
    expect(t.paymentState).toBe("PAID");
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

/**
 * Tax stops being one number.
 *
 * `taxRatePct` was a single rate on the whole bill. Bangladesh charges 15% VAT,
 * hotels here commonly add a 10% service charge on top of the room, and the
 * restaurant is taxed at its own rate — none of which one percentage can say.
 * Worse, a menu price is often quoted with VAT already inside it, so the number
 * on the board is gross and the net has to be worked back out.
 *
 * So a resort has tax *rules*: what each one is charged on, whether it is
 * already inside the price, and whether it stacks on the ones before it. A
 * single flat rate is still just one rule, which is what every existing caller
 * passes and what the migration turns the old column into.
 */
describe("bookingTotals — tax rules", () => {
  const vat = (over: Partial<TaxRule> = {}): TaxRule => ({
    code: "VAT", label: "VAT", ratePct: 15, appliesTo: "ALL",
    inclusive: false, compound: false, sortOrder: 0, ...over,
  });

  it("charges one exclusive rule exactly like the old single rate", () => {
    const rules = bookingTotals({
      items: [room(5000)], payments: [], discount: 0, checkIn: IN, checkOut: OUT,
      taxRules: [vat()],
    });
    const flat = bookingTotals({
      items: [room(5000)], payments: [], discount: 0, checkIn: IN, checkOut: OUT,
      taxRatePct: 15,
    });
    expect(rules.tax).toBe(flat.tax);
    expect(rules.total).toBe(flat.total);
    expect(rules.total).toBe(17250);
  });

  it("charges a rule only on what it applies to", () => {
    // 3 nights × 5000 room + one 1000 restaurant line; VAT on the food alone
    const t = bookingTotals({
      items: [room(5000), fb(1000)], payments: [], discount: 0, checkIn: IN, checkOut: OUT,
      taxRules: [vat({ appliesTo: "FB" })],
    });
    expect(t.rent).toBe(16000);
    expect(t.tax).toBe(150);
    expect(t.total).toBe(16150);
  });

  it("stacks a service charge and VAT the way a hotel bill does", () => {
    // service charge 10% on the room, then VAT 15% on room + service charge
    const t = bookingTotals({
      items: [room(1000)], payments: [], discount: 0,
      checkIn: IN, checkOut: new Date("2026-08-16T00:00:00Z"), // one night
      taxRules: [
        { code: "SC", label: "Service charge", ratePct: 10, appliesTo: "ROOM", inclusive: false, compound: false, sortOrder: 0 },
        { code: "VAT", label: "VAT", ratePct: 15, appliesTo: "ROOM", inclusive: false, compound: true, sortOrder: 1 },
      ],
    });
    expect(t.rent).toBe(1000);
    // 100 service charge, then 15% of 1100 = 165
    expect(t.tax).toBe(265);
    expect(t.total).toBe(1265);
  });

  it("works the net back out of a price that already includes the tax", () => {
    // a menu board saying 115 with 15% VAT inside it is 100 of food and 15 of tax
    const t = bookingTotals({
      items: [fb(115)], payments: [], discount: 0, checkIn: IN, checkOut: OUT,
      taxRules: [vat({ appliesTo: "FB", inclusive: true })],
    });
    expect(t.taxable).toBe(100);
    expect(t.tax).toBe(15);
    expect(t.total).toBe(115);
  });

  it("spreads a discount across what is taxed, so nothing is taxed twice over", () => {
    // 1000 of room and 1000 of food, 200 off the bill: 100 comes off each
    const t = bookingTotals({
      items: [room(1000), fb(1000)], payments: [], discount: 200,
      checkIn: IN, checkOut: new Date("2026-08-16T00:00:00Z"),
      taxRules: [vat({ appliesTo: "FB" })],
    });
    expect(t.taxable).toBe(1800);
    expect(t.tax).toBe(135); // 15% of the 900 of food that survives the discount
  });

  it("names what each tax was, so an invoice can print the lines", () => {
    const t = bookingTotals({
      items: [room(1000)], payments: [], discount: 0,
      checkIn: IN, checkOut: new Date("2026-08-16T00:00:00Z"),
      taxRules: [
        { code: "SC", label: "Service charge", ratePct: 10, appliesTo: "ROOM", inclusive: false, compound: false, sortOrder: 0 },
        { code: "VAT", label: "VAT", ratePct: 15, appliesTo: "ROOM", inclusive: false, compound: true, sortOrder: 1 },
      ],
    });
    expect(t.taxLines).toEqual([
      { code: "SC", label: "Service charge", ratePct: 10, amount: 100 },
      { code: "VAT", label: "VAT", ratePct: 15, amount: 165 },
    ]);
  });

  it("charges nothing when a resort has no rules", () => {
    const t = bookingTotals({ items: [room(5000)], payments: [], discount: 0, checkIn: IN, checkOut: OUT, taxRules: [] });
    expect(t.tax).toBe(0);
    expect(t.total).toBe(15000);
    expect(t.taxLines).toEqual([]);
  });
});

/**
 * A restaurant bill is a bill too.
 *
 * `Σ unitPrice × qty` was written out by hand in nine places — the restaurant
 * service four times, reports twice, the exporter, the importer and the
 * platform's invoice mail — with inconsistent rounding between them, and
 * `fb_bills` had no tax column at all. So a resort charging VAT charged it on
 * the room and not on the food, and nothing anywhere could have noticed.
 */
describe("fbBillTotals", () => {
  const line = (unitPrice: number, qty = 1) => ({ unitPrice, qty });

  it("sums the lines", () => {
    const t = fbBillTotals({ items: [line(300, 2), line(450)] }, []);
    expect(t.net).toBe(1050);
    expect(t.tax).toBe(0);
    expect(t.total).toBe(1050);
  });

  it("charges the resort's restaurant rate, not its room rate", () => {
    const t = fbBillTotals({ items: [line(1000)] }, [
      { code: "VAT", label: "VAT", ratePct: 15, appliesTo: "ROOM", inclusive: false, compound: false, sortOrder: 0 },
      { code: "FBVAT", label: "Restaurant VAT", ratePct: 5, appliesTo: "FB", inclusive: false, compound: false, sortOrder: 1 },
    ]);
    expect(t.tax).toBe(50);
    expect(t.total).toBe(1050);
  });

  it("works the tax back out of a menu price that already includes it", () => {
    const t = fbBillTotals({ items: [line(115)] }, [
      { code: "VAT", label: "VAT", ratePct: 15, appliesTo: "FB", inclusive: true, compound: false, sortOrder: 0 },
    ]);
    expect(t.net).toBe(100);
    expect(t.tax).toBe(15);
    expect(t.total).toBe(115);
  });

  it("names the lines so a bill can print them", () => {
    const t = fbBillTotals({ items: [line(1000)] }, [
      { code: "FBVAT", label: "Restaurant VAT", ratePct: 5, appliesTo: "ALL", inclusive: false, compound: false, sortOrder: 0 },
    ]);
    expect(t.taxLines).toEqual([{ code: "FBVAT", label: "Restaurant VAT", ratePct: 5, amount: 50 }]);
  });
});
