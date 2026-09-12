/**
 * The bill above the Advance box.
 *
 * Its whole job is to not do arithmetic. Every figure here comes from the
 * server's quote, because the three things that move a price — a seasonal
 * rate, a standing offer, the resort's tax rules — are all decided there. The
 * one subtraction it is allowed is total minus what the clerk is taking now,
 * and that is about the money in the drawer rather than what the stay is
 * worth.
 *
 * So these tests are mostly about what it does NOT invent.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { BookingQuote } from "@rh/shared";
import { StayBill } from "@/app/(app)/bookings/stay-bill";

const QUOTE: BookingQuote = {
  nights: 2,
  rent: 14000,
  roomRent: 10000,
  discount: 1000,
  discountIsAutomatic: false,
  taxable: 13000,
  taxRatePct: 15,
  tax: 1950,
  taxLines: [{ code: "VAT", label: "VAT", ratePct: 15, amount: 1950 }],
  total: 14950,
  lines: [
    { kind: "ROOM", label: "Tiulip", unitPrice: 5000, qty: 1, nights: 2, amount: 10000 },
    { kind: "EXTRA_PERSON", label: "Extra person — Tiulip", unitPrice: 1000, qty: 4, nights: 2, persons: 2, amount: 4000 },
  ],
};

describe("the stay bill", () => {
  it("asks for a room before it says anything about money", () => {
    render(<StayBill quote={null} advance={0} loading={false} />);
    expect(screen.getByText(/pick a room/i)).toBeTruthy();
  });

  it("shows every line the server priced, with its arithmetic", () => {
    render(<StayBill quote={QUOTE} advance={0} loading={false} />);
    expect(screen.getByText("Tiulip")).toBeTruthy();
    // the amounts are formatted for the resort, not sent down as a string
    expect(screen.getByText("2 nights × ৳5,000.00")).toBeTruthy();
    expect(screen.getByText("Extra person — Tiulip")).toBeTruthy();
    expect(screen.getByText("2 × 2 nights × ৳1,000.00")).toBeTruthy();
  });

  it("prints the server's total rather than adding the lines up", () => {
    // the lines sum to 14,000 and the total is 14,950 — a bill that did its own
    // arithmetic would print the wrong one, and be wrong in exactly the way a
    // browser missing the tax rules would be
    render(<StayBill quote={QUOTE} advance={0} loading={false} />);
    const total = screen.getByText("Total").closest("tr");
    expect(total?.textContent).toContain("14,950");
  });

  it("leaves out a tax rule that charged this bill nothing", () => {
    // the resort's set includes a restaurant rate; a room-only stay must not
    // print "VAT on food 5% ৳0.00" for the clerk to have to explain
    render(
      <StayBill
        quote={{ ...QUOTE, taxLines: [...QUOTE.taxLines, { code: "FB_VAT", label: "VAT on food", ratePct: 5, amount: 0 }] }}
        advance={0}
        loading={false}
      />,
    );
    expect(screen.queryByText(/VAT on food/i)).toBeNull();
  });

  it("names the tax the resort charges instead of calling it 'tax'", () => {
    render(<StayBill quote={QUOTE} advance={0} loading={false} />);
    expect(screen.getByText("VAT")).toBeTruthy();
    expect(screen.getByText("15%")).toBeTruthy();
  });

  it("says when a discount was the resort's idea and not the clerk's", () => {
    render(<StayBill quote={{ ...QUOTE, discountIsAutomatic: true }} advance={0} loading={false} />);
    expect(screen.getByText(/standing offer/i)).toBeTruthy();
  });

  it("stays quiet about the offer when the clerk typed the discount", () => {
    render(<StayBill quote={QUOTE} advance={0} loading={false} />);
    expect(screen.queryByText(/standing offer/i)).toBeNull();
  });

  it("says nothing about an advance until one is being taken", () => {
    render(<StayBill quote={QUOTE} advance={0} loading={false} />);
    expect(screen.queryByText(/still due/i)).toBeNull();
  });

  it("works out what is left after the advance", () => {
    render(<StayBill quote={QUOTE} advance={5000} loading={false} />);
    const due = screen.getByText("Still due").closest("tr");
    expect(due?.textContent).toContain("9,950");
  });

  it("never shows a negative balance when somebody overpays", () => {
    render(<StayBill quote={QUOTE} advance={20000} loading={false} />);
    const due = screen.getByText("Still due").closest("tr");
    expect(due?.textContent).not.toContain("-");
    expect(due?.textContent).toContain("0");
  });

  it("keeps the old figures readable while new ones are on the way", () => {
    // blanking the bill on every keystroke is worse than a stale number for a
    // moment: the clerk is reading it out loud while they type
    const { container } = render(<StayBill quote={QUOTE} advance={0} loading={true} />);
    expect(screen.getByText("Tiulip")).toBeTruthy();
    expect(container.querySelector("[aria-busy='true']")).toBeTruthy();
  });
});
