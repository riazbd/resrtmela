/**
 * A month of payroll as a pay run — the way Gusto, ADP and every payroll desk
 * present it: a pay period and a payday, three steps (review, pay, payslips),
 * and one sum from gross to what is still to be handed over.
 *
 * The owner, 2026-10-03, looking at "Nobody on payroll this month": "duniyar
 * boro boro company pay roll jevabe chalay, temon koro nai?" The sheet already
 * held every figure; what it lacked was the order a person reads them in and
 * a single next step. This works that out once for the console and the app.
 */
import type { PayrollSheet } from "./api-types";

export type PayRunStatus =
  /** nobody has ever been put on payroll */
  | "SETUP"
  /** people exist, but none were on payroll this month */
  | "NOBODY_THIS_MONTH"
  /** a month that has not started */
  | "UPCOMING"
  /** nothing handed over yet */
  | "TO_PAY"
  /** some handed over, some left */
  | "PART_PAID"
  /** everybody settled */
  | "PAID";

export const PAY_RUN_STATUS_LABEL: Record<PayRunStatus, string> = {
  SETUP: "Not set up",
  NOBODY_THIS_MONTH: "Nobody this month",
  UPCOMING: "Upcoming",
  TO_PAY: "Ready to pay",
  PART_PAID: "Part paid",
  PAID: "Paid",
};

/** The three steps of a pay run, in order. */
export const PAY_RUN_STEPS = ["Review", "Pay", "Payslips"] as const;

const lastDay = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, m!, 0)).getUTCDate();
};

export function payRunOf(sheet: PayrollSheet, opts: { today: string; peopleCount: number }) {
  const { month, rows, totals } = sheet;
  const thisMonth = opts.today.slice(0, 7);
  const end = lastDay(month);
  const gross = rows.reduce((s, r) => s + r.base, 0);
  const net = totals.expected;
  const paid = totals.paid;
  const toPay = totals.remaining;
  const payable = rows.filter((r) => r.remaining > 0);

  const status: PayRunStatus =
    opts.peopleCount === 0
      ? "SETUP"
      : rows.length === 0
        ? "NOBODY_THIS_MONTH"
        : month > thisMonth
          ? "UPCOMING"
          : toPay <= 0
            ? "PAID"
            : paid > 0
              ? "PART_PAID"
              : "TO_PAY";

  /** 0 Review, 1 Pay, 2 Payslips — the step this run is on. */
  const step = status === "PAID" ? 2 : status === "PART_PAID" ? 1 : 0;

  return {
    month,
    status,
    step,
    period: { from: `${month}-01`, to: `${month}-${String(end).padStart(2, "0")}` },
    /** the last day of the month: when a salary for it falls due */
    payday: `${month}-${String(end).padStart(2, "0")}`,
    /** what everyone earns for the days they were on payroll, before bonus and deduction */
    gross,
    bonus: totals.bonus,
    deduction: totals.deduction,
    /** gross + bonus − deduction */
    net,
    /** handed over already: salary paid and advances */
    paid,
    advance: totals.advance,
    /** net − paid, for this month */
    toPay,
    /** earlier months still owed */
    arrears: totals.arrears,
    headcount: totals.headcount,
    settled: totals.settledCount,
    /** the people with something left this month, and how much */
    payable: payable.map((r) => ({ employeeId: r.employeeId, name: r.name, designation: r.designation, amount: r.remaining })),
  };
}

export type PayRun = ReturnType<typeof payRunOf>;
