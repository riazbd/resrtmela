/**
 * A plan sold two ways.
 *
 * The platform billed by the month and nothing else: one fee column, one
 * `addMonths(period, 1)`, one price on the pricing page. Every subscription
 * business of any size sells the year as well, because a year paid up front is
 * a year of churn that cannot happen and cash that arrives now — which is why
 * "two months free" is the near-universal shape of the offer.
 *
 * This is the arithmetic of that, kept in one place so the pricing page, the
 * signup, the billing sweep and the owner's own screen cannot each round it
 * differently. It is deliberately free of the database: what a year costs and
 * what it saves is a sum, not a query.
 */
import { describe, expect, it } from "vitest";
import {
  BILLING_CYCLES,
  isBillingCycle,
  monthsIn,
  feeFor,
  perMonth,
  yearlySaving,
  soldYearly,
} from "../src/common/billing-cycle";

/** Just enough of a plan row to price it. */
const plan = (monthlyFee: number, yearlyFee: number | null = null) =>
  ({ monthlyFee, yearlyFee }) as { monthlyFee: unknown; yearlyFee: unknown };

describe("which rhythms exist", () => {
  it("is monthly and yearly, and nothing else", () => {
    expect([...BILLING_CYCLES]).toEqual(["MONTHLY", "YEARLY"]);
  });

  it("recognises the two, and refuses anything else", () => {
    expect(isBillingCycle("MONTHLY")).toBe(true);
    expect(isBillingCycle("YEARLY")).toBe(true);
    expect(isBillingCycle("WEEKLY")).toBe(false);
    expect(isBillingCycle("yearly")).toBe(false);
  });

  it("knows how long a period is", () => {
    expect(monthsIn("MONTHLY")).toBe(1);
    expect(monthsIn("YEARLY")).toBe(12);
  });
});

describe("what one period costs", () => {
  it("a month's fee, on the monthly rhythm", () => {
    expect(feeFor(plan(2500, 25000), "MONTHLY")).toBe(2500);
  });

  it("the year's own price, not twelve months of the monthly one", () => {
    // the whole point of the yearly price is that it is less than 12 × monthly
    expect(feeFor(plan(2500, 25000), "YEARLY")).toBe(25000);
  });

  it("refuses to price a year of a plan that is not sold by the year", () => {
    expect(() => feeFor(plan(2500, null), "YEARLY")).toThrowError(/not sold by the year/i);
  });

  it("says plainly which plans can be bought annually", () => {
    expect(soldYearly(plan(2500, 25000))).toBe(true);
    expect(soldYearly(plan(2500, null))).toBe(false);
    // a yearly price of nothing is not a free year, it is an unset price
    expect(soldYearly(plan(2500, 0))).toBe(false);
  });
});

describe("what the customer sees", () => {
  it("carries the yearly price back to a monthly-looking number", () => {
    // "৳2,083/mo, billed annually" — the line every pricing page uses, because
    // nobody compares ৳25,000 against ৳2,500 in their head
    expect(perMonth(plan(2500, 25000), "YEARLY")).toBeCloseTo(2083.33, 2);
    expect(perMonth(plan(2500, 25000), "MONTHLY")).toBe(2500);
  });

  it("works out the saving, in both the ways a page states it", () => {
    const saving = yearlySaving(plan(2500, 25000));
    expect(saving).not.toBeNull();
    // ten months' price for twelve months
    expect(saving!.monthsFree).toBeCloseTo(2, 2);
    expect(saving!.pct).toBe(17);
    expect(saving!.amount).toBe(5000);
  });

  it("rounds the percentage the way a badge reads it", () => {
    // 12 x 5000 = 60000 against 54000 is exactly 10%
    expect(yearlySaving(plan(5000, 54000))!.pct).toBe(10);
  });

  it("has nothing to say about a plan with no yearly price", () => {
    expect(yearlySaving(plan(2500, null))).toBeNull();
  });

  /**
   * An owner may price the year at more than twelve months — a mistake, or a
   * deliberate premium for not committing. Either way the page must not draw a
   * "save −8%" badge, so there is no saving to report.
   */
  it("reports no saving when the year costs more than the months do", () => {
    expect(yearlySaving(plan(2500, 32000))).toBeNull();
  });
});
