import { describe, expect, it } from "vitest";
import { formatMoney } from "@rh/shared";

/**
 * Currency and locale are tenant settings. The taka sign used to be written
 * into 92 code sites while Resort.currency was never read once.
 */
describe("formatMoney", () => {
  it("renders taka the way the console always has", () => {
    expect(formatMoney(1234.5, { currency: "BDT", locale: "en-IN" })).toBe("৳1,234.50");
  });

  it("groups in lakh for the Bangladeshi and Indian convention", () => {
    expect(formatMoney(1234567, { currency: "BDT", locale: "en-IN" })).toBe("৳12,34,567.00");
  });

  it("uses the right symbol for other currencies", () => {
    expect(formatMoney(1234.5, { currency: "USD", locale: "en-US" })).toBe("$1,234.50");
    expect(formatMoney(1234.5, { currency: "INR", locale: "en-IN" })).toBe("₹1,234.50");
  });

  it("can drop the fraction for compact displays", () => {
    expect(formatMoney(1234.5, { currency: "BDT", locale: "en-IN", decimals: 0 })).toBe("৳1,235");
  });

  it("treats a missing amount as nothing owed rather than printing NaN", () => {
    expect(formatMoney(null, { currency: "BDT", locale: "en-IN" })).toBe("৳0.00");
    expect(formatMoney(undefined, { currency: "BDT", locale: "en-IN" })).toBe("৳0.00");
  });

  it("accepts the string a Decimal column serialises to", () => {
    expect(formatMoney("1234.50", { currency: "BDT", locale: "en-IN" })).toBe("৳1,234.50");
  });

  it("falls back rather than throwing on a bad currency or locale", () => {
    expect(formatMoney(1234.5, { currency: "NOPE", locale: "en-IN" })).toContain("1,234.50");
    expect(formatMoney(1234.5, { currency: "BDT", locale: "not-a-locale" })).toContain("1,234.5");
  });

  it("defaults to the platform's own currency when a tenant has none set", () => {
    expect(formatMoney(1000)).toBe("৳1,000.00");
  });
});
