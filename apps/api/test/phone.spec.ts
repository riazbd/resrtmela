/**
 * Phone numbers, when the platform is no longer only Bangladeshi.
 *
 * normalizePhone hard-coded 880. That is correct for every customer today and
 * wrong the first time this is sold across a border — and the failure is the
 * quiet kind: an Indian guest's 10-digit number gets an 880 stapled to the
 * front, the SMS goes to a stranger in Dhaka, and nothing anywhere says so.
 *
 * The country is now a parameter with a Bangladeshi default, so nothing about
 * today's behaviour changes and tomorrow's is a setting rather than a rewrite.
 */
import { describe, expect, it } from "vitest";
import { normalizePhone, DEFAULT_COUNTRY } from "../src/common/dates";

describe("normalising a phone number", () => {
  it("still does exactly what it did for Bangladesh", () => {
    expect(normalizePhone("01711111111")).toBe("8801711111111");
    expect(normalizePhone("+880 1711-111111")).toBe("8801711111111");
    expect(normalizePhone("1711111111")).toBe("8801711111111");
    expect(normalizePhone("8801711111111")).toBe("8801711111111");
  });

  it("defaults to Bangladesh, so no caller had to change", () => {
    expect(DEFAULT_COUNTRY.dialCode).toBe("880");
    expect(normalizePhone("01711111111", DEFAULT_COUNTRY)).toBe(normalizePhone("01711111111"));
  });

  it("uses the country it is given instead of assuming", () => {
    const india = { dialCode: "91", trunkPrefix: "0", nationalLength: 10 };
    expect(normalizePhone("09876543210", india)).toBe("919876543210");
    expect(normalizePhone("9876543210", india)).toBe("919876543210");
    expect(normalizePhone("+91 98765 43210", india)).toBe("919876543210");
  });

  it("leaves a number that already carries another country's code alone", () => {
    // a Nepali guest booking a Bangladeshi resort keeps their own number
    expect(normalizePhone("+9779812345678")).toBe("9779812345678");
  });

  it("does not invent digits for something that is not a phone number", () => {
    expect(normalizePhone("123")).toBe("123");
    expect(normalizePhone("")).toBe("");
  });
});
