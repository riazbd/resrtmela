/**
 * The single source of truth for booking money (doc §5.2: never stored, always
 * computed). Every caller — booking detail, Day Sheet, reports, notifications,
 * invoices — must go through here so one stay can never be worth two numbers.
 *
 * Rules, verified against the Sky Eco workbook:
 *   ROOM          unitPrice × qty × nights   (a rate is per night)
 *   EXTRA_PERSON  unitPrice × qty            (qty already carries the nights)
 *   ACTIVITY / FB unitPrice × qty            (charged once, not per night)
 *   taxable       rent − discount, floored at zero
 *   total         taxable + tax (exclusive, at the resort's rate)
 *   due           total − paid              (refunds excluded from paid)
 */
import { nightsBetween, round2 } from "./dates";

export type MoneyItemKind = "ROOM" | "ACTIVITY" | "FB" | "EXTRA_PERSON";

/** Decimal columns arrive as Prisma.Decimal; Number() handles those and strings. */
export type Money = number | string | { toString(): string };

export interface MoneyItem {
  itemKind: MoneyItemKind;
  unitPrice: Money;
  qty: number;
}

export interface MoneyPayment {
  paymentType: "ADVANCE" | "FINAL" | "REFUND";
  amount: Money;
}

export interface BookingMoneyInput {
  items: MoneyItem[];
  payments: MoneyPayment[];
  discount: Money;
  checkIn?: Date | null;
  checkOut?: Date | null;
  /**
   * The resort's tax rate, as a percentage. Exclusive: it is added on top of
   * the discounted amount rather than assumed to be inside the rates.
   * Omitted or 0 leaves every figure exactly as it was before tax existed.
   */
  taxRatePct?: Money;
}

export interface BookingTotals {
  nights: number;
  rent: number;
  roomRent: number;
  discount: number;
  /** rent − discount, floored at zero: what tax is charged on */
  taxable: number;
  taxRatePct: number;
  tax: number;
  /** taxable + tax: the invoice total */
  total: number;
  paid: number;
  refunded: number;
  due: number;
  paymentState: "UNPAID" | "PARTIAL" | "PAID";
}

const num = (v: Money): number => Number(v);

/** Nights this item is charged for: rooms scale with the stay, everything else does not. */
function itemNights(kind: MoneyItemKind, stayNights: number): number {
  return kind === "ROOM" && stayNights > 0 ? stayNights : 1;
}

export function bookingTotals(input: BookingMoneyInput): BookingTotals {
  const nights =
    input.checkIn && input.checkOut ? nightsBetween(input.checkIn, input.checkOut) : 0;

  let rent = 0;
  let roomRent = 0;
  for (const item of input.items) {
    const amount = num(item.unitPrice) * item.qty * itemNights(item.itemKind, nights);
    rent += amount;
    if (item.itemKind === "ROOM") roomRent += amount;
  }

  const discount = num(input.discount);
  let paid = 0;
  let refunded = 0;
  for (const p of input.payments) {
    if (p.paymentType === "REFUND") refunded += num(p.amount);
    else paid += num(p.amount);
  }

  // a discount larger than the rent is a data-entry slip, not a negative bill
  const taxable = round2(Math.max(0, rent - discount));
  const taxRatePct = num(input.taxRatePct ?? 0);
  const tax = round2((taxable * taxRatePct) / 100);
  const total = round2(taxable + tax);

  const due = round2(total - paid);
  const paymentState = due <= 0.001 && paid > 0 ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID";

  return {
    nights,
    rent: round2(rent),
    roomRent: round2(roomRent),
    discount,
    taxable,
    taxRatePct,
    tax,
    total,
    paid: round2(paid),
    refunded: round2(refunded),
    due,
    paymentState,
  };
}

/**
 * Revenue attributed to one night of a stay (sheet tab 11 / Day Sheet):
 * room rent minus discount, spread evenly over the nights booked.
 */
export function perNightRevenue(roomRent: number, discount: number, nights: number): number {
  return round2((roomRent - discount) / (nights || 1));
}

// ───────────────────────────── agent commission ─────────────────────────────

export type CommissionKind = "PERCENT" | "FLAT";

export interface AgentTerms {
  commissionKind: CommissionKind | string;
  commissionRate: Money | null | undefined;
}

/**
 * What an agent earns on some rent.
 *
 * PERCENT is a share of the rent; FLAT is a fixed fee per booking. That rule
 * lived in three places — the owner's agent report, the agent's own report,
 * and now the booking screen — and three copies of a money rule is exactly
 * how an agent on flat terms came to see ৳75,000 where the owner's report
 * said ৳1,000. One copy.
 */
export function agentCommission(terms: AgentTerms, rent: Money, bookings = 1): number {
  const rate = num(terms.commissionRate ?? 0);
  const amount = terms.commissionKind === "FLAT" ? rate * bookings : (num(rent) * rate) / 100;
  // never more than the rent it is taken from: a flat fee larger than a cheap
  // booking would otherwise hand the resort a negative night
  return round2(Math.min(Math.max(0, amount), Math.max(0, num(rent))));
}

/** The two numbers an agent needs on screen: what the guest pays, what they owe. */
export function agentPricing(terms: AgentTerms, rent: Money, bookings = 1) {
  const actual = round2(num(rent));
  const commission = agentCommission(terms, actual, bookings);
  return {
    actual,
    commissionKind: (terms.commissionKind === "FLAT" ? "FLAT" : "PERCENT") as CommissionKind,
    commissionRate: num(terms.commissionRate ?? 0),
    commission,
    agentPrice: round2(actual - commission),
  };
}
