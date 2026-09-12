/**
 * How often an account is billed, and what that costs.
 *
 * The platform billed by the month and only by the month: one fee, one
 * `addMonths(period, 1)`, one price on the pricing card. Selling the year as
 * well is the ordinary shape of a subscription business — the customer pays
 * less per month, the platform gets the cash now and a year of churn that
 * cannot happen — and "two months free" is how almost everyone states it.
 *
 * The model is the one every billing system converges on: **one plan, a price
 * per rhythm**. The plan carries the limits and the features; `monthlyFee` and
 * `yearlyFee` are two prices for the same thing. The alternative — a second
 * "Starter Yearly" plan row — forks the room caps, the feature ticks, the
 * upgrade paths and every report that groups by plan, and the two copies then
 * drift apart. This codebase has already paid that bill once, with two plan
 * tables that did not know about each other.
 *
 * Nothing here touches the database. What a year costs, and what it saves, is
 * arithmetic — and keeping it in one place is what stops the pricing page, the
 * signup, the billing sweep and the owner's own screen each rounding it
 * differently.
 */

export const BILLING_CYCLES = ["MONTHLY", "YEARLY"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

/** The prices a plan carries. `Decimal` from Prisma, a number from a form. */
interface Priced {
  monthlyFee: unknown;
  yearlyFee: unknown;
}

export function isBillingCycle(value: unknown): value is BillingCycle {
  return typeof value === "string" && (BILLING_CYCLES as readonly string[]).includes(value);
}

/** How many months one period of this rhythm covers. */
export function monthsIn(cycle: BillingCycle): number {
  return cycle === "YEARLY" ? 12 : 1;
}

/**
 * Is this plan on the yearly shelf at all?
 *
 * A null price means the owner has not offered it annually. So does zero: a
 * yearly fee of nothing is an unset price, not a free year — and reading it as
 * a real price would put a ৳0 card on the pricing page.
 */
export function soldYearly(plan: Priced): boolean {
  const yearly = Number(plan.yearlyFee ?? 0);
  return Number.isFinite(yearly) && yearly > 0;
}

/**
 * What one period costs.
 *
 * Deliberately not `monthlyFee × 12` for a year. The whole reason a customer
 * takes the yearly rhythm is that the year has its own, smaller price; deriving
 * it would quietly bill twelve months at the monthly rate and make the discount
 * a thing the pricing page claims and the invoice denies.
 */
export function feeFor(plan: Priced, cycle: BillingCycle): number {
  if (cycle === "MONTHLY") return Number(plan.monthlyFee);
  if (!soldYearly(plan)) {
    throw Object.assign(new Error("This plan is not sold by the year"), { status: 400 });
  }
  return Number(plan.yearlyFee);
}

/** The same money as a monthly-looking number — "৳2,083/mo, billed annually". */
export function perMonth(plan: Priced, cycle: BillingCycle): number {
  return feeFor(plan, cycle) / monthsIn(cycle);
}

/**
 * What the year saves against twelve months bought one at a time.
 *
 * Both the forms a pricing page uses: a percentage for the badge, and the
 * months-free figure the copy talks in. Null when there is no yearly price, and
 * also when the year costs *more* than the months do — an owner may price it
 * that way, by mistake or on purpose, and a "save −8%" badge is worse than no
 * badge.
 */
export function yearlySaving(plan: Priced): { pct: number; monthsFree: number; amount: number } | null {
  if (!soldYearly(plan)) return null;
  const monthly = Number(plan.monthlyFee);
  const yearly = Number(plan.yearlyFee);
  const twelve = monthly * 12;
  if (!(twelve > 0) || yearly >= twelve) return null;
  const amount = Math.round((twelve - yearly) * 100) / 100;
  return {
    pct: Math.round((amount / twelve) * 100),
    monthsFree: Math.round((amount / monthly) * 100) / 100,
    amount,
  };
}

/** The rhythm, as a word a screen can print: "month" / "year". */
export function cycleNoun(cycle: BillingCycle): string {
  return cycle === "YEARLY" ? "year" : "month";
}
