/**
 * Recording how a payment actually arrived.
 *
 * The platform console collects money in three places — subscription dues,
 * one-off charges, and email-credit orders. Two of them sent `method: "CASH"`
 * as a literal, whatever had really happened, so a bKash transfer and a bank
 * transfer both went into the ledger as cash. That note is the only record of
 * how the money came in, and it is what a bKash merchant statement has to be
 * reconciled against.
 *
 * The list is not ours to invent either. `options.PAYMENT_METHOD.defaults`
 * already lives in platform settings where the super admin can edit it — the
 * same lesson lib/resort-options.ts records for the resort screens, which had
 * four hardcoded copies of the same array and one of them wrong.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { paymentMethodsFrom, HowItArrived } from "@/app/(app)/platform/how-it-arrived";

const SETTINGS = {
  "options.PAYMENT_METHOD.defaults": JSON.stringify([
    { code: "CASH", label: "Cash" },
    { code: "BKASH", label: "bKash" },
    { code: "BANK", label: "Bank transfer" },
  ]),
};

describe("the methods offered", () => {
  it("comes from the settings the super admin can edit", () => {
    expect(paymentMethodsFrom(SETTINGS).map((m) => m.code)).toEqual(["CASH", "BKASH", "BANK"]);
  });

  it("still offers cash when the settings have not arrived", () => {
    // money can be handed over before any screen has loaded
    expect(paymentMethodsFrom({}).map((m) => m.code)).toContain("CASH");
  });

  it("survives a setting somebody has broken", () => {
    expect(() => paymentMethodsFrom({ "options.PAYMENT_METHOD.defaults": "not json" })).not.toThrow();
    expect(paymentMethodsFrom({ "options.PAYMENT_METHOD.defaults": "not json" }).length).toBeGreaterThan(0);
  });
});

describe("asking how the money arrived", () => {
  it("offers every method rather than assuming one", () => {
    render(<HowItArrived methods={paymentMethodsFrom(SETTINGS)} onPick={() => {}} onCancel={() => {}} />);
    expect(screen.getByText("Cash")).toBeTruthy();
    expect(screen.getByText("bKash")).toBeTruthy();
    expect(screen.getByText("Bank transfer")).toBeTruthy();
  });

  it("hands back the code the ledger stores, not the label", () => {
    const onPick = vi.fn();
    render(<HowItArrived methods={paymentMethodsFrom(SETTINGS)} onPick={onPick} onCancel={() => {}} />);
    fireEvent.click(screen.getByText("bKash"));
    expect(onPick).toHaveBeenCalledWith("BKASH");
  });

  it("records nothing when the collector backs out", () => {
    const onPick = vi.fn();
    const onCancel = vi.fn();
    render(<HowItArrived methods={paymentMethodsFrom(SETTINGS)} onPick={onPick} onCancel={onCancel} />);
    fireEvent.click(screen.getByText(/cancel/i));
    expect(onPick).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it("names what is being collected, so the wrong row cannot be marked paid", () => {
    render(
      <HowItArrived
        methods={paymentMethodsFrom(SETTINGS)}
        what="Sky Eco Group — ৳5,000.00"
        onPick={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText(/Sky Eco Group — ৳5,000.00/)).toBeTruthy();
  });
});
