/**
 * What a generated invoice offers you.
 *
 * The owner asked for the choice to be there at the moment the invoice is
 * made: download it, or print it. What was there instead was a single link
 * that opened the invoice and fired the print dialog at it after 600ms —
 * so "save a copy" meant letting a print dialog open, dismissing it, finding
 * a second button on the page, and pressing that.
 *
 * The intent now travels in the URL, and this is the piece that reads it. It
 * is a function rather than an `if` inside the page because the page is the
 * one place it cannot be tested: it is a print dialog and a file save.
 */
import { describe, expect, it } from "vitest";
import { invoiceIntent, invoiceHref } from "@/lib/invoice-intent";

describe("what the invoice page should do on arrival", () => {
  it("prints when it was opened to print", () => {
    expect(invoiceIntent("?print=1")).toBe("print");
  });

  it("downloads when it was opened to download", () => {
    expect(invoiceIntent("?download=1")).toBe("download");
  });

  it("does nothing when somebody just opened the invoice to look at it", () => {
    expect(invoiceIntent("")).toBe("view");
    expect(invoiceIntent("?")).toBe("view");
    expect(invoiceIntent("?id=4")).toBe("view");
  });

  /**
   * Both at once is a caller's mistake, and the safe reading is the one that
   * does not open a dialog over a file save.
   */
  it("downloads rather than prints when asked for both", () => {
    expect(invoiceIntent("?print=1&download=1")).toBe("download");
  });

  it("ignores a flag that is switched off", () => {
    expect(invoiceIntent("?print=0")).toBe("view");
    expect(invoiceIntent("?download=0")).toBe("view");
  });

  /**
   * The old page matched on `includes("print=1")`, which is also true of
   * `?noprint=1` and of a guest name that happens to contain it.
   */
  it("is not fooled by a parameter that merely contains the word", () => {
    expect(invoiceIntent("?noprint=1")).toBe("view");
    expect(invoiceIntent("?ref=sprint=1")).toBe("view");
  });
});

describe("the links the bookings screen puts on a row", () => {
  it("sends one to the printer and one to the file system", () => {
    expect(invoiceHref(42, "print")).toBe("/invoice/42?print=1");
    expect(invoiceHref(42, "download")).toBe("/invoice/42?download=1");
  });

  it("opens plainly when no action is asked for", () => {
    expect(invoiceHref(42, "view")).toBe("/invoice/42");
  });

  it("round-trips, so the two halves cannot drift apart", () => {
    for (const intent of ["print", "download", "view"] as const) {
      const href = invoiceHref(7, intent);
      expect(invoiceIntent(href.slice(href.indexOf("?")))).toBe(intent === "view" ? "view" : intent);
    }
  });
});
