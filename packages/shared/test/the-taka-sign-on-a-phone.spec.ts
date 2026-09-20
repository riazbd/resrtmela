/**
 * Money keeps its symbol on a device (2026-09-20).
 *
 * Found on the first screen of the first real build. The dashboard read
 * **"BDT 39,500"** where every browser had shown "৳39,500" — and the
 * figure wrapped mid-number, "BDT 39,5 / 00", because the prefix is four
 * characters instead of one.
 *
 * The cause is the same one `dayLabel` exists for. Hermes ships without
 * full ICU: `Intl.NumberFormat` is there, it does not throw, and
 * `currencyDisplay: "narrowSymbol"` quietly gives back the currency code.
 * Nothing fails — the app just speaks a different language about money
 * than the console does, to the same owner about the same resort.
 *
 * So the symbol is written down for the currencies this platform serves,
 * exactly as the month names are, and the engine is asked only for the
 * digits and their grouping — which Hermes does get right, including
 * en-IN's lakh.
 */
import { afterEach, describe, expect, it } from "vitest";
import { currencySymbol, formatMoney } from "../src/index";

describe("the symbol is ours, not the engine's", () => {
  it("prints taka as taka", () => {
    expect(formatMoney(39500, { currency: "BDT", decimals: 0 })).toBe("৳39,500");
  });

  it("groups in lakh for en-IN, which is what Bangladesh reads", () => {
    expect(formatMoney(123456.5, { currency: "BDT" })).toBe("৳1,23,456.50");
  });

  it("knows the other currencies a tenant might use", () => {
    expect(formatMoney(1000, { currency: "USD", locale: "en-US", decimals: 0 })).toBe("$1,000");
    expect(formatMoney(1000, { currency: "INR", locale: "en-IN", decimals: 0 })).toBe("₹1,000");
    expect(formatMoney(1000, { currency: "EUR", locale: "en-US", decimals: 0 })).toBe("€1,000");
    expect(formatMoney(1000, { currency: "GBP", locale: "en-US", decimals: 0 })).toBe("£1,000");
  });

  /**
   * A currency nobody wrote down still has to print. ICU's own answer is
   * the right one there — "AED 1,000" is what a reader expects, and a
   * made-up glyph would be worse than the code.
   */
  it("leaves a currency it does not know to the engine", () => {
    expect(formatMoney(1000, { currency: "AED", locale: "en-US", decimals: 0 })).toContain("AED");
    expect(formatMoney(1000, { currency: "AED", locale: "en-US", decimals: 0 })).toContain("1,000");
  });

  /**
   * The sign goes outside the symbol. Placing the symbol ourselves put it
   * first — "৳-4,000" — which reads as a typo, and at a glance the minus
   * disappears into the currency mark. A loss that does not look like a
   * loss is the worst possible rounding of this screen.
   */
  it("puts a minus in front of the symbol, not behind it", () => {
    expect(formatMoney(-4000, { currency: "BDT", decimals: 0 })).toBe("-৳4,000");
    expect(formatMoney(-0.5, { currency: "USD", locale: "en-US" })).toBe("-$0.50");
  });

  /**
   * A figure that rounds away to nothing is nothing. "-৳0" on a bill is
   * a debt of zero, which is a sentence with no meaning.
   */
  it("does not sign a zero, however it got there", () => {
    expect(formatMoney(0, { currency: "BDT", decimals: 0 })).toBe("৳0");
    expect(formatMoney(-0, { currency: "BDT", decimals: 0 })).toBe("৳0");
    expect(formatMoney(-0.4, { currency: "BDT", decimals: 0 })).toBe("৳0");
  });

  /**
   * Where the symbol goes is the locale's business, not ours.
   *
   * German and French put the euro *after* the number. The first fix
   * here placed the symbol itself, as a prefix, for every currency it
   * knew — which would have been wrong for both, and the API renders
   * invoices with this function. Caught before deploying by asking what
   * ICU actually returns rather than assuming.
   */
  it("leaves placement to the locale where the engine knows it", () => {
    // ICU separates with a non-breaking space, so the rule is asserted
    // as an order rather than as an exact string
    const euro = formatMoney(1234.5, { currency: "EUR", locale: "de-DE" });
    expect(euro.startsWith("1.234,50")).toBe(true);
    expect(euro.endsWith("€")).toBe(true);
    expect(formatMoney(1234.5, { currency: "USD", locale: "en-US" })).toBe("$1,234.50");
  });

  it("says the symbol on its own, for a field label", () => {
    expect(currencySymbol({ currency: "BDT" })).toBe("৳");
    expect(currencySymbol({ currency: "USD" })).toBe("$");
  });
});

/**
 * The regression itself, reproduced.
 *
 * Node has full ICU and cannot show the bug on its own, so the engine is
 * replaced with one that behaves the way Hermes does: `Intl` exists, it
 * formats numbers correctly, and it answers every currency with its code.
 * Before the symbol table this test printed "BDT 39,500".
 */
describe("on an engine with no currency data, like Hermes", () => {
  const realIntl = globalThis.Intl;
  afterEach(() => {
    globalThis.Intl = realIntl;
  });

  function withoutCurrencyData() {
    globalThis.Intl = {
      ...realIntl,
      NumberFormat: function (locale?: string, options?: Intl.NumberFormatOptions) {
        // a cut-down ICU: correct digits, and the code where a symbol should be
        const plain = new realIntl.NumberFormat(locale, { ...options, style: "decimal" });
        return {
          format: (n: number) =>
            options?.style === "currency"
              ? `${options.currency} ${plain.format(n)}`
              : plain.format(n),
          formatToParts: (n: number) =>
            options?.style === "currency"
              ? [
                  { type: "currency", value: options.currency ?? "" },
                  { type: "literal", value: " " },
                  { type: "integer", value: plain.format(n) },
                ]
              : [{ type: "integer", value: plain.format(n) }],
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  it("still prints taka as taka", () => {
    withoutCurrencyData();
    expect(formatMoney(39500, { currency: "BDT", decimals: 0 })).toBe("৳39,500");
  });

  it("still groups the digits the way the locale does", () => {
    withoutCurrencyData();
    expect(formatMoney(123456.5, { currency: "BDT" })).toBe("৳1,23,456.50");
  });

  it("still answers a field label", () => {
    withoutCurrencyData();
    expect(currencySymbol({ currency: "BDT" })).toBe("৳");
  });
});
