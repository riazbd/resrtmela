/**
 * How a booking's discount was given: an amount of money, or a percentage of
 * the stay.
 *
 * The booking keeps what was typed beside what it comes to. A percentage has to
 * stay a percentage — when the dates or the head count change, "10% off" is
 * still 10% of the new stay, where an amount somebody worked out on a phone
 * calculator would silently go stale.
 *
 * `FLAT` is the default because every discount written before this existed was
 * an amount.
 */
export const DISCOUNT_KINDS = ["FLAT", "PERCENT"] as const;

export type DiscountKind = (typeof DISCOUNT_KINDS)[number];

export function isDiscountKind(value: unknown): value is DiscountKind {
  return typeof value === "string" && (DISCOUNT_KINDS as readonly string[]).includes(value);
}

export const DISCOUNT_KIND_LABELS: Record<DiscountKind, string> = {
  FLAT: "Amount",
  PERCENT: "Percent",
};

/**
 * What a discount comes to, in money.
 *
 * `base` is what a percentage is a share of — the stay's rooms and extra
 * persons, not the restaurant bill or a damage charge added at checkout.
 * An amount larger than the base is left as typed: `bookingTotals` already
 * floors the bill at zero, and quietly shrinking the figure would hide the slip.
 */
export function discountAmount(kind: DiscountKind, value: number, base: number): number {
  if (kind === "PERCENT") return Math.round(((base * value) / 100) * 100) / 100;
  return value;
}
