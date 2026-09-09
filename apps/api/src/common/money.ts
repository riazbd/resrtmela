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
   * A single exclusive rate on the whole bill — the shorthand every caller used
   * before tax was a list, and still the right shape for a resort with one VAT
   * and nothing else. Turned into one `ALL` rule below.
   */
  taxRatePct?: Money;
  /**
   * The resort's tax rules, in the order they are charged. Wins over
   * `taxRatePct` when both are given.
   */
  taxRules?: TaxRule[];
}

/**
 * One charge a resort adds to a bill.
 *
 * A single percentage could not describe this market: Bangladesh charges 15%
 * VAT, hotels here commonly add a 10% service charge on the room, the
 * restaurant is taxed at its own rate, and a menu price is usually quoted with
 * the VAT already inside it.
 */
export interface TaxRule {
  code: string;
  label: string;
  ratePct: number;
  /** which part of the bill it is charged on */
  appliesTo: TaxScope;
  /** already inside the listed price, rather than added to it */
  inclusive: boolean;
  /** charged on the base plus the exclusive rules before it, not the base alone */
  compound: boolean;
  sortOrder: number;
}

export type TaxScope = "ALL" | MoneyItemKind;

/** One line of tax as an invoice should print it. */
export interface TaxLine {
  code: string;
  label: string;
  ratePct: number;
  amount: number;
}

export interface BookingTotals {
  nights: number;
  rent: number;
  roomRent: number;
  discount: number;
  /** rent − discount, floored at zero, net of any tax already inside the prices */
  taxable: number;
  /** the single rate when there is exactly one, for screens that show "+15%" */
  taxRatePct: number;
  tax: number;
  /** every tax charged, named and priced, in the order it was charged */
  taxLines: TaxLine[];
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


/** The rules as given, or the single flat rate turned into one. */
function normaliseRules(input: BookingMoneyInput): TaxRule[] {
  if (input.taxRules?.length) return [...input.taxRules].sort((a, b) => a.sortOrder - b.sortOrder);
  const flat = num(input.taxRatePct ?? 0);
  if (flat <= 0) return [];
  return [
    { code: "TAX", label: "Tax", ratePct: flat, appliesTo: "ALL", inclusive: false, compound: false, sortOrder: 0 },
  ];
}

const covers = (rule: TaxRule, kind: MoneyItemKind) =>
  rule.appliesTo === "ALL" || rule.appliesTo === kind;

/**
 * What a resort's rules add to a bill.
 *
 * Three things have to be right, and one number could express none of them.
 *
 * **Inclusive first.** A menu price of 115 with 15% VAT inside it is 100 of
 * food and 15 of tax; every later rule is charged on the 100, not the 115. So
 * the gross is split before anything else runs.
 *
 * **The discount comes off pro rata.** `Booking.discount` is one figure against
 * a bill that may be part room and part restaurant, and the two can be taxed
 * differently. Taking it off each part in proportion is the rule that needs no
 * further explanation and matches the old behaviour exactly when there is only
 * one rate.
 *
 * **Compounding is a choice, not a default.** A service charge that VAT is then
 * charged on is how a hotel bill in this market reads; a second tax charged on
 * the same base is how others read. The rule says which.
 */
function chargeTaxes(
  grossByKind: Map<MoneyItemKind, number>,
  rent: number,
  discount: number,
  rules: TaxRule[],
): { taxable: number; tax: number; taxLines: TaxLine[] } {
  if (!rules.length) {
    return { taxable: round2(Math.max(0, rent - discount)), tax: 0, taxLines: [] };
  }

  // ── 1. take out tax that is already inside the listed prices ──
  const netByKind = new Map<MoneyItemKind, number>();
  const inclusiveTax = new Map<string, number>();
  for (const [kind, gross] of grossByKind) {
    const inclusive = rules.filter((r) => r.inclusive && covers(r, kind));
    const rate = inclusive.reduce((s, r) => s + r.ratePct, 0);
    const net = rate > 0 ? gross / (1 + rate / 100) : gross;
    netByKind.set(kind, net);
    for (const r of inclusive) {
      // each inclusive rule's share of what was already in the price
      inclusiveTax.set(r.code, (inclusiveTax.get(r.code) ?? 0) + (net * r.ratePct) / 100);
    }
  }

  // ── 2. the discount comes off the net, in proportion ──
  const netTotal = [...netByKind.values()].reduce((s, v) => s + v, 0);
  const relief = Math.min(discount, netTotal);
  const keep = netTotal > 0 ? (netTotal - relief) / netTotal : 0;
  const baseByKind = new Map<MoneyItemKind, number>();
  for (const [kind, net] of netByKind) baseByKind.set(kind, net * keep);
  const taxable = round2(Math.max(0, netTotal - relief));

  // ── 3. charge the rest, in order, compounding where asked ──
  const lines: TaxLine[] = [];
  /** exclusive tax charged so far, per kind, for the rules that compound */
  const stacked = new Map<MoneyItemKind, number>();
  for (const rule of rules) {
    if (rule.inclusive) {
      const amount = round2((inclusiveTax.get(rule.code) ?? 0) * keep);
      lines.push({ code: rule.code, label: rule.label, ratePct: rule.ratePct, amount });
      continue;
    }
    let base = 0;
    for (const [kind, amount] of baseByKind) {
      if (!covers(rule, kind)) continue;
      base += amount + (rule.compound ? (stacked.get(kind) ?? 0) : 0);
    }
    const amount = round2((base * rule.ratePct) / 100);
    lines.push({ code: rule.code, label: rule.label, ratePct: rule.ratePct, amount });
    // remember it against the kinds it hit, so a later compounding rule sees it
    if (base > 0) {
      for (const [kind, kindBase] of baseByKind) {
        if (!covers(rule, kind)) continue;
        const share = kindBase + (rule.compound ? (stacked.get(kind) ?? 0) : 0);
        stacked.set(kind, (stacked.get(kind) ?? 0) + (share * rule.ratePct) / 100);
      }
    }
  }

  const tax = round2(lines.reduce((s, l) => s + l.amount, 0));
  return { taxable, tax, taxLines: lines };
}

export function bookingTotals(input: BookingMoneyInput): BookingTotals {
  const nights =
    input.checkIn && input.checkOut ? nightsBetween(input.checkIn, input.checkOut) : 0;

  let rent = 0;
  let roomRent = 0;
  /** gross per kind, so a rule can be charged on the part it applies to */
  const grossByKind = new Map<MoneyItemKind, number>();
  for (const item of input.items) {
    const amount = num(item.unitPrice) * item.qty * itemNights(item.itemKind, nights);
    rent += amount;
    if (item.itemKind === "ROOM") roomRent += amount;
    grossByKind.set(item.itemKind, (grossByKind.get(item.itemKind) ?? 0) + amount);
  }

  const discount = num(input.discount);
  let paid = 0;
  let refunded = 0;
  for (const p of input.payments) {
    if (p.paymentType === "REFUND") refunded += num(p.amount);
    else paid += num(p.amount);
  }

  // a discount larger than the rent is a data-entry slip, not a negative bill
  const rules = normaliseRules(input);
  const { taxable, tax, taxLines } = chargeTaxes(grossByKind, rent, discount, rules);
  const taxRatePct = rules.length === 1 ? rules[0]!.ratePct : num(input.taxRatePct ?? 0);
  const total = round2(taxable + tax);

  /**
   * What is owed is measured against what we have *kept*, not what we took.
   *
   * `refunded` was tracked here and then never used: `due` was `total - paid`.
   * So a stay refunded in full still read PAID with nothing outstanding, and
   * every report that sums payments counted the returned money as collected.
   * `paid` stays gross so the ledger can show all three numbers and the desk
   * can see what happened.
   */
  const netPaid = round2(paid - refunded);
  const due = round2(total - netPaid);
  const paymentState =
    due <= 0.001 && netPaid > 0 ? "PAID" : netPaid > 0 ? "PARTIAL" : "UNPAID";

  return {
    nights,
    rent: round2(rent),
    roomRent: round2(roomRent),
    discount,
    taxable,
    taxRatePct,
    tax,
    taxLines,
    total,
    paid: round2(paid),
    refunded: round2(refunded),
    due,
    paymentState,
  };
}


/** One line of a restaurant bill, as every caller already shapes it. */
export interface FbLine {
  unitPrice: Money;
  qty: number;
}

export interface FbBillTotals {
  net: number;
  tax: number;
  total: number;
  taxLines: TaxLine[];
}

/**
 * What a restaurant bill comes to.
 *
 * `Σ unitPrice × qty` was written out by hand in nine places — the restaurant
 * service four times, reports twice, the exporter, the importer and the
 * platform's invoice mail — with inconsistent rounding between them. And
 * `fb_bills` had no tax column at all, so a resort charging VAT charged it on
 * the room and not on the food, which is exactly backwards for a market where
 * the restaurant is often taxed at its own rate.
 *
 * The rules are the resort's whole set; the ones that do not reach the
 * restaurant simply do not apply, which is what `appliesTo` is for.
 */
export function fbBillTotals(bill: { items: FbLine[] }, rules: TaxRule[]): FbBillTotals {
  const gross = bill.items.reduce((s, i) => s + num(i.unitPrice) * i.qty, 0);
  const byKind = new Map<MoneyItemKind, number>([["FB", gross]]);
  const { taxable, tax, taxLines } = chargeTaxes(byKind, gross, 0, rules);
  return { net: taxable, tax, total: round2(taxable + tax), taxLines };
}

/**
 * Revenue attributed to one night of a stay (sheet tab 11 / Day Sheet):
 * room rent minus discount, spread evenly over the nights booked.
 */
export function perNightRevenue(roomRent: number, discount: number, nights: number): number {
  return round2((roomRent - discount) / (nights || 1));
}


// ─────────────────────────── ranges, month by month ───────────────────────────

/**
 * Every `YYYY-MM` a range touches.
 *
 * The P&L walked this with `d.setUTCMonth(d.getUTCMonth() + 1)` from the range
 * start. From a 31st that overflows — 31 January plus a month is 31 February,
 * which resolves to 3 March — so February was skipped and a whole month's
 * payroll vanished from the statement. Stepping the month number rather than
 * the date cannot overflow.
 */
export function monthsInRange(fromIso: string, toIso: string): string[] {
  const from = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const to = new Date(`${toIso.slice(0, 10)}T00:00:00Z`);
  const months: string[] = [];
  let y = from.getUTCFullYear();
  let m = from.getUTCMonth();
  while (Date.UTC(y, m, 1) < to.getTime()) {
    months.push(`${y}-${String(m + 1).padStart(2, "0")}`);
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  return months;
}

/**
 * How much of a month's salary belongs to a range: 0 to 1.
 *
 * The P&L charged every payroll row for any month the range touched, in full.
 * A report for 1–10 September showed September's entire wage bill against ten
 * days of revenue, so the profit for that window was nonsense — and the shorter
 * the range, the worse it read.
 */
export function payrollShareOfRange(month: string, fromIso: string, toIso: string): number {
  const [y, m] = month.split("-").map(Number);
  const monthStart = Date.UTC(y!, m! - 1, 1);
  const monthEnd = Date.UTC(y!, m!, 1);
  const from = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`).getTime();
  const to = new Date(`${toIso.slice(0, 10)}T00:00:00Z`).getTime();
  const overlap = Math.min(monthEnd, to) - Math.max(monthStart, from);
  if (overlap <= 0) return 0;
  return overlap / (monthEnd - monthStart);
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
