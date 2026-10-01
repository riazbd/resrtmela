/**
 * Who is on a month of payroll, and what the month is worth to them.
 *
 * The owner, 2026-10-02: *"kar sathe kar connection, ke payroll e ashbe, ke
 * ashbe na, ki pabe ki pabe na, kichui bujha jay na."* Payroll was a list of
 * names and salaries, on every month alike, worth the salary and nothing
 * else. These are the rules that answer those four questions, written once so
 * the server, the console and the app say the same thing:
 *
 * - **Who is on a month:** everyone who had joined by its last day and had
 *   not left before its first — and anyone paid against it whatever the
 *   dates say, because a payment that happened is never hidden.
 * - **What a month is worth:** the salary, for the days on payroll when
 *   somebody joined or left part-way; plus bonuses, less deductions.
 * - **What is left:** that, less what was handed over, less anything paid
 *   ahead in earlier months.
 * - **Who it connects to:** a person on payroll may be linked to the login
 *   they use in the app. A login is who can use the app; payroll is who is
 *   paid. Agents are on neither — they earn commission.
 */

/** A change to what a month is worth — not money handed over. */
export const PAYROLL_ADJUSTMENT_KINDS = ["BONUS", "DEDUCTION"] as const;
export type PayrollAdjustmentKind = (typeof PAYROLL_ADJUSTMENT_KINDS)[number];

export function isPayrollAdjustmentKind(value: unknown): value is PayrollAdjustmentKind {
  return typeof value === "string" && (PAYROLL_ADJUSTMENT_KINDS as readonly string[]).includes(value);
}

export const PAYROLL_ADJUSTMENT_LABELS: Record<PayrollAdjustmentKind, string> = {
  BONUS: "Bonus",
  DEDUCTION: "Deduction",
};

/** "2026-09" → 30. */
export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, m!, 0)).getUTCDate();
}

/** "2026-09" → "2026-10"; a negative step goes back. */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Every month from `from` to `to`, both included; empty when `to` is earlier. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

/** "2026-09" → "September 2026"; `short` → "Sep"; `year` → "Sep 26". */
export function monthName(month: string, form: "long" | "short" | "year" = "long"): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1, 1));
  if (form === "short") return d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  if (form === "year") return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * How many of a month's days somebody was on payroll.
 *
 * Dates are "YYYY-MM-DD" or null, and null means no limit on that side. A
 * person who joined on the 16th of a 30-day month was on it for 15 days.
 */
export function daysOnPayroll(month: string, joinDate: string | null, leftDate: string | null): number {
  const total = daysInMonth(month);
  const first = `${month}-01`;
  const last = `${month}-${String(total).padStart(2, "0")}`;
  const from = joinDate && joinDate > first ? joinDate : first;
  const to = leftDate && leftDate < last ? leftDate : last;
  if (from > to) return 0;
  return Number(to.slice(8, 10)) - Number(from.slice(8, 10)) + 1;
}

/**
 * The salary a month is worth for the days on payroll.
 *
 * Rounded to whole taka: "৳7,258.06" is a number nobody hands over, and the
 * one taka either way is not worth a question from the cook.
 */
export function salaryForDays(salary: number, month: string, days: number): number {
  const total = daysInMonth(month);
  if (days >= total) return salary;
  if (days <= 0) return 0;
  return Math.round((salary * days) / total);
}

/** Where a month stands for one person. */
export const PAYROLL_MONTH_STATES = [
  "SETTLED",
  "PART_PAID",
  "UNPAID",
  "RUNNING",
  "UPCOMING",
  "NOTHING_DUE",
  "NOT_ON_PAYROLL",
] as const;
export type PayrollMonthState = (typeof PAYROLL_MONTH_STATES)[number];

/** What each state is called, and what it means in one sentence. */
export const PAYROLL_MONTH_STATE_LABELS: Record<PayrollMonthState, { label: string; means: string }> = {
  SETTLED: { label: "Paid", means: "Everything the month was worth has been handed over." },
  PART_PAID: { label: "Part paid", means: "Some has been handed over; the rest is still due." },
  UNPAID: { label: "Unpaid", means: "Nothing handed over yet for a month that has started." },
  RUNNING: { label: "This month", means: "The month is still going and nothing has been handed over yet." },
  UPCOMING: { label: "Upcoming", means: "A month still to come." },
  NOTHING_DUE: { label: "Nothing due", means: "On payroll, but deductions took the month to nothing." },
  NOT_ON_PAYROLL: { label: "Not on payroll", means: "Had not joined yet, had already left, or was not on the books." },
};

export interface PayrollMonthFigures {
  /** the monthly salary, as agreed */
  salary: number;
  /** days on payroll this month, of how many it has */
  days: number;
  daysInMonth: number;
  /** the salary for those days */
  base: number;
  bonus: number;
  deduction: number;
  /** base + bonus − deduction, floored at zero */
  due: number;
  /** everything handed over against this month */
  paid: number;
  /** how much of `paid` was taken early */
  advance: number;
  /** paid in earlier months beyond what they were worth, used against this one */
  aheadUsed: number;
  /** due − paid − aheadUsed, floored at zero */
  remaining: number;
  /** handed over beyond what the month was worth, carried to the next */
  over: number;
  state: PayrollMonthState;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * One person's month, counted.
 *
 * `ahead` is what earlier months were overpaid by — an advance bigger than the
 * month it was taken against. It comes off this month before anything else,
 * because the alternative is the owner paying the cook twice for the same
 * days.
 */
export function payrollMonthFigures(input: {
  salary: number;
  month: string;
  joinDate: string | null;
  leftDate: string | null;
  payments: { amount: number; kind: string }[];
  adjustments: { amount: number; kind: string }[];
  /** overpaid in earlier months and not yet used */
  ahead?: number;
  /** the month it is now, which tells "unpaid" from "upcoming" */
  current: string;
}): PayrollMonthFigures {
  const total = daysInMonth(input.month);
  const days = daysOnPayroll(input.month, input.joinDate, input.leftDate);
  const base = salaryForDays(input.salary, input.month, days);
  const sum = (rows: { amount: number; kind: string }[], kind?: string) =>
    r2(rows.filter((r) => !kind || r.kind === kind).reduce((s, r) => s + r.amount, 0));
  const bonus = sum(input.adjustments, "BONUS");
  const deduction = sum(input.adjustments, "DEDUCTION");
  const due = Math.max(0, r2(base + bonus - deduction));
  const paid = sum(input.payments);
  const advance = sum(input.payments, "ADVANCE");
  const owing = Math.max(0, r2(due - paid));
  const aheadUsed = Math.min(owing, Math.max(0, input.ahead ?? 0));
  const remaining = r2(owing - aheadUsed);
  const over = Math.max(0, r2(paid - due));

  let state: PayrollMonthState;
  if (days === 0 && paid === 0 && bonus === 0) state = "NOT_ON_PAYROLL";
  else if (due === 0) state = paid > 0 ? "SETTLED" : "NOTHING_DUE";
  else if (remaining === 0) state = "SETTLED";
  else if (paid > 0 || aheadUsed > 0) state = "PART_PAID";
  // the month still going is not late: salaries are paid when it ends
  else state = input.month > input.current ? "UPCOMING" : input.month === input.current ? "RUNNING" : "UNPAID";

  return {
    salary: input.salary,
    days,
    daysInMonth: total,
    base,
    bonus,
    deduction,
    due,
    paid,
    advance,
    aheadUsed,
    remaining,
    over,
    state,
  };
}

/** One month of a person's history. */
export interface PayrollHistoryMonth {
  month: string;
  figures: PayrollMonthFigures;
  /** false before the books start for this person: not counted as unpaid */
  tracked: boolean;
  /** what earlier months still have left to pay */
  arrears: number;
  /** overpaid in earlier months and not used up before this one */
  ahead: number;
}

/**
 * A person's months in order, each told what earlier ones left behind.
 *
 * `from` is where the books start for this person — the month they were put
 * on payroll in the app. Anything recorded earlier starts them earlier. Months
 * before that are not counted as unpaid: the software was not in use for
 * them, and a cook who has worked for six years is not owed six years because
 * somebody typed a join date.
 */
export function payrollHistory(input: {
  salary: number;
  joinDate: string | null;
  leftDate: string | null;
  from: string;
  to: string;
  current: string;
  payments: { month: string; amount: number; kind: string }[];
  adjustments: { month: string; amount: number; kind: string }[];
}): PayrollHistoryMonth[] {
  const recorded = [...input.payments.map((p) => p.month), ...input.adjustments.map((a) => a.month)].sort();
  const books = recorded[0] && recorded[0] < input.from ? recorded[0] : input.from;
  const start = books < input.to ? books : input.to;
  let ahead = 0;
  let arrears = 0;
  const out: PayrollHistoryMonth[] = [];
  for (const month of monthsBetween(start, input.to)) {
    const payments = input.payments.filter((p) => p.month === month);
    const adjustments = input.adjustments.filter((a) => a.month === month);
    const tracked = month >= books;
    const figures = payrollMonthFigures({
      salary: input.salary,
      month,
      joinDate: input.joinDate,
      leftDate: input.leftDate,
      payments,
      adjustments,
      ahead,
      current: input.current,
    });
    out.push({ month, figures, tracked, arrears, ahead });
    if (!tracked) continue;
    ahead = r2(ahead - figures.aheadUsed + figures.over);
    arrears = r2(arrears + figures.remaining);
  }
  return out;
}
