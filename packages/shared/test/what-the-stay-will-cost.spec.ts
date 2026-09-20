/**
 * The bill shown before a booking exists (2026-09-20).
 *
 * `billLines` reads a booking that has been taken. This reads the quote the
 * server prices *before* it is taken — the figure a clerk says out loud on
 * the phone, which then has to match the invoice the guest is handed.
 *
 * It is a separate function rather than a shared one because the two shapes
 * genuinely differ: a quote's lines arrive priced and in order, with the
 * arithmetic already in them, and a quote has no charges, no food and no
 * payments. What it does have, and a booking's items do not, is the three
 * closing rows that a stay bill has no business inventing — discount, tax,
 * and what is still due after the advance.
 *
 * The console draws all of it inline in `stay-bill.tsx`, including two
 * decisions worth writing down: a discount nobody typed has to say so, and
 * a tax rule that added nothing does not belong on the bill at all.
 */
import { describe, expect, it } from "vitest";
import { quoteBill } from "../src/index";
import type { BookingQuote } from "../src/api-types";

const quote = (over: Partial<BookingQuote> = {}): BookingQuote => ({
  nights: 2,
  rent: 13000,
  roomRent: 13000,
  discount: 0,
  discountIsAutomatic: false,
  taxable: 13000,
  taxRatePct: 0,
  tax: 0,
  taxLines: [],
  total: 13000,
  lines: [
    { kind: "ROOM", label: "1 Camellia", unitPrice: 6500, qty: 1, nights: 2, amount: 13000 },
  ],
  ...over,
});

/** Plain ASCII money, so the assertions read as arithmetic and not as ICU. */
const money = { currency: "USD", locale: "en-US", decimals: 0 };

const find = (rows: ReturnType<typeof quoteBill>, label: string) =>
  rows.find((r) => r.label === label);

describe("what the rooms come to", () => {
  it("shows the working out, because that is what gets read down the phone", () => {
    const rows = quoteBill(quote(), { money });
    expect(find(rows, "1 Camellia")).toMatchObject({
      kind: "line",
      detail: "2 nights × $6,500",
      amount: 13000,
      deduction: false,
    });
  });

  it("counts one night as a night", () => {
    const rows = quoteBill(
      quote({
        nights: 1,
        lines: [
          { kind: "ROOM", label: "1 Camellia", unitPrice: 6500, qty: 1, nights: 1, amount: 6500 },
        ],
      }),
      { money },
    );
    expect(find(rows, "1 Camellia")?.detail).toBe("1 night × $6,500");
  });

  /** People × nights × the rate of the room they are in. */
  it("says how many extra people, and for how long", () => {
    const rows = quoteBill(
      quote({
        lines: [
          {
            kind: "EXTRA_PERSON",
            label: "Extra person — 1 Camellia",
            unitPrice: 500,
            qty: 4,
            nights: 2,
            persons: 2,
            amount: 2000,
          },
        ],
      }),
      { money },
    );
    expect(find(rows, "Extra person — 1 Camellia")?.detail).toBe("2 × 2 nights × $500");
  });
});

describe("what comes off", () => {
  it("draws no discount row when there is no discount", () => {
    expect(quoteBill(quote(), { money }).some((r) => r.kind === "discount")).toBe(false);
  });

  it("draws the discount as a deduction", () => {
    const rows = quoteBill(quote({ discount: 1300, total: 11700 }), { money });
    expect(find(rows, "Discount")).toMatchObject({
      kind: "discount",
      amount: 1300,
      deduction: true,
      detail: null,
    });
  });

  /**
   * A discount nobody typed needs saying so, or the clerk reads it as a
   * mistake and takes it off again.
   */
  it("says when the discount was the resort's own standing offer", () => {
    const rows = quoteBill(
      quote({ discount: 1300, discountIsAutomatic: true, total: 11700 }),
      { money },
    );
    expect(find(rows, "Discount")?.detail).toBe("standing offer");
  });
});

describe("what is added", () => {
  it("names each tax and its rate", () => {
    const rows = quoteBill(
      quote({
        taxLines: [{ code: "VAT", label: "VAT", ratePct: 7.5, amount: 975 }],
        tax: 975,
        total: 13975,
      }),
      { money },
    );
    expect(find(rows, "VAT")).toMatchObject({ kind: "tax", detail: "7.5%", amount: 975 });
  });

  /**
   * The resort's rule set includes a rate for the restaurant. Printing
   * "VAT on food 5% $0" under a room-only stay invites the clerk to explain
   * a charge that was never made.
   */
  it("leaves out a rule that added nothing", () => {
    const rows = quoteBill(
      quote({
        taxLines: [
          { code: "VAT", label: "VAT", ratePct: 7.5, amount: 975 },
          { code: "FOOD", label: "VAT on food", ratePct: 5, amount: 0 },
        ],
        tax: 975,
        total: 13975,
      }),
      { money },
    );
    expect(rows.filter((r) => r.kind === "tax").map((r) => r.label)).toEqual(["VAT"]);
  });
});

describe("the number the conversation is about", () => {
  it("ends on the total when nothing has been paid", () => {
    const rows = quoteBill(quote(), { money });
    expect(rows.at(-1)).toMatchObject({ kind: "total", label: "Total", amount: 13000 });
  });

  /**
   * Once an advance is agreed, the last line is what is still owed — the
   * same reason a restaurant bill ends there rather than on the subtotal.
   */
  it("ends on what is still due once an advance is taken", () => {
    const rows = quoteBill(quote(), { advance: 5000, money });
    expect(find(rows, "Advance now")).toMatchObject({ amount: 5000, deduction: true });
    expect(rows.at(-1)).toMatchObject({ kind: "due", label: "Still due", amount: 8000 });
  });

  /** An advance larger than the stay is money owed back, not a negative bill. */
  it("never shows a negative amount due", () => {
    const rows = quoteBill(quote(), { advance: 20000, money });
    expect(rows.at(-1)).toMatchObject({ kind: "due", amount: 0 });
  });

  it("has no advance row when none is being taken", () => {
    const rows = quoteBill(quote(), { advance: 0, money });
    expect(rows.some((r) => r.kind === "advance" || r.kind === "due")).toBe(false);
  });
});

describe("the order it is read in", () => {
  it("runs rooms, discount, tax, total, advance, due", () => {
    const rows = quoteBill(
      quote({
        discount: 1300,
        taxLines: [{ code: "VAT", label: "VAT", ratePct: 7.5, amount: 878 }],
        tax: 878,
        total: 12578,
      }),
      { advance: 2000, money },
    );
    expect(rows.map((r) => r.kind)).toEqual([
      "line",
      "discount",
      "tax",
      "total",
      "advance",
      "due",
    ]);
  });

  /** Keys, because two rooms of the same type share a label. */
  it("gives every row a key of its own", () => {
    const rows = quoteBill(
      quote({
        lines: [
          { kind: "ROOM", label: "Deluxe", unitPrice: 6500, qty: 1, nights: 2, amount: 13000 },
          { kind: "ROOM", label: "Deluxe", unitPrice: 6500, qty: 1, nights: 2, amount: 13000 },
        ],
        total: 26000,
      }),
      { money },
    );
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });
});
