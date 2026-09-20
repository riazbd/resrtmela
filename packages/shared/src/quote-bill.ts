/**
 * What the stay will cost, before there is a booking to bill.
 *
 * The clerk used to be asked how much money to take before being told what
 * the stay was worth, so the figure they typed was either a guess or a sum
 * done on paper — and the paper sum could not be right, because the
 * seasonal rate, the resort's standing offers and its tax rules are all
 * decided on the server.
 *
 * So the server prices it, with the same code that will charge it, and this
 * turns that answer into something that reads like a bill: the rooms and
 * their nights, the extra beds, what came off, what tax was added, and only
 * then the number. Two decisions in here are easy to lose in a rewrite:
 *
 *   - **a discount nobody typed says so**, or the clerk reads it as a
 *     mistake and takes it off again;
 *   - **a tax rule that added nothing is not a line.** The resort's set
 *     includes a rate for the restaurant, and "VAT on food 5% ৳0" under a
 *     room-only stay invites an explanation of a charge never made.
 *
 * Separate from `billLines` because the shapes genuinely differ — a quote
 * arrives priced and in order and has no charges, food or payments — but it
 * answers the same question, and a guest read one total at the desk and
 * shown another on a phone has been overcharged by one of them.
 */
import type { BookingQuote, QuoteLine } from "./api-types";
import { formatMoney, type MoneyFormat } from "./index";

export type QuoteRowKind = "line" | "discount" | "tax" | "total" | "advance" | "due";

export interface QuoteRow {
  /** Unique within the bill: two rooms of one type share a label. */
  id: string;
  kind: QuoteRowKind;
  label: string;
  /** How it was arrived at, or null where the label says everything. */
  detail: string | null;
  /** Always positive. `deduction` says which way it goes. */
  amount: number;
  /** Drawn with a minus and in the colour money coming off is drawn in. */
  deduction: boolean;
}

const nightWord = (n: number) => `${n} night${n === 1 ? "" : "s"}`;

/**
 * The arithmetic behind a line, in words.
 *
 * Phrased here rather than sent down as a string: the amounts are formatted
 * in the resort's own currency and grouping (en-IN groups in lakh), and the
 * console has a Bangla toggle. A server-built sentence can do neither.
 */
function workingOut(line: QuoteLine, money: MoneyFormat): string {
  // the caller's own format, unmodified: the console prints paise on a bill
  // and the phone does not, and neither of them wants this function's opinion
  const rate = formatMoney(line.unitPrice, money);
  const nights = nightWord(line.nights);
  if (line.kind === "EXTRA_PERSON" && line.persons) {
    return `${line.persons} × ${nights} × ${rate}`;
  }
  return `${nights} × ${rate}`;
}

export function quoteBill(
  quote: BookingQuote,
  options: { advance?: number; money?: MoneyFormat } = {},
): QuoteRow[] {
  const money = options.money ?? {};
  const advance = Number.isFinite(options.advance) ? Math.max(0, options.advance as number) : 0;
  const rows: QuoteRow[] = [];

  quote.lines.forEach((line, i) => {
    rows.push({
      id: `line-${i}`,
      kind: "line",
      label: line.label,
      detail: workingOut(line, money),
      amount: line.amount,
      deduction: false,
    });
  });

  if (quote.discount > 0) {
    rows.push({
      id: "discount",
      kind: "discount",
      label: "Discount",
      detail: quote.discountIsAutomatic ? "standing offer" : null,
      amount: quote.discount,
      deduction: true,
    });
  }

  for (const tax of quote.taxLines) {
    if (tax.amount <= 0) continue;
    rows.push({
      id: `tax-${tax.code}`,
      kind: "tax",
      label: tax.label,
      detail: `${tax.ratePct}%`,
      amount: tax.amount,
      deduction: false,
    });
  }

  rows.push({
    id: "total",
    kind: "total",
    label: "Total",
    detail: null,
    amount: quote.total,
    deduction: false,
  });

  if (advance > 0) {
    rows.push({
      id: "advance",
      kind: "advance",
      label: "Advance now",
      detail: null,
      amount: advance,
      deduction: true,
    });
    rows.push({
      id: "due",
      kind: "due",
      label: "Still due",
      detail: null,
      // an advance larger than the stay is money owed back, not a negative bill
      amount: Math.max(0, quote.total - advance),
      deduction: false,
    });
  }

  return rows;
}
