/**
 * What a payroll payment is.
 *
 * Payroll used to hold one payment per employee per month, and that payment
 * was the salary — a unique index on `(employeeId, month)` made it so. Real
 * payroll at a resort does not work that way: a cook on 15,000 takes 2,000 on
 * the 8th and 5,000 on the 20th, and what is handed over at the end of the
 * month is the 8,000 that is left. Asking for the second payment got
 * "already paid for 2026-09 — undo it first".
 *
 * So a month holds as many payments as it took, and each one says which of the
 * two things it was.
 *
 * **They are the same money and a different fact.** An advance is handed over
 * against a month not yet worked; a settlement closes it. The owner asks two
 * different questions of them — what did we hand out early, and is this month
 * closed — and the person reading the sheet needs to see "Advance · 8 Sep ·
 * ৳2,000" rather than an unlabelled number.
 *
 * `SALARY` is the default because every row written before this existed was
 * one: reading them as anything else would rewrite history at the moment of
 * the upgrade.
 */
export const PAYROLL_PAYMENT_KINDS = ["ADVANCE", "SALARY"] as const;

export type PayrollPaymentKind = (typeof PAYROLL_PAYMENT_KINDS)[number];

export function isPayrollPaymentKind(value: unknown): value is PayrollPaymentKind {
  return typeof value === "string" && (PAYROLL_PAYMENT_KINDS as readonly string[]).includes(value);
}

/** What each kind is called on a screen. */
export const PAYROLL_PAYMENT_LABELS: Record<PayrollPaymentKind, string> = {
  ADVANCE: "Advance",
  SALARY: "Salary",
};

/**
 * What is still owed on a month, floored at zero.
 *
 * Floored rather than allowed to go negative: an advance larger than the
 * salary is a real thing — money against a month still to come — and a sheet
 * reading "−2,000 remaining" says the resort is owed wages by its cook, which
 * is not what happened. The payments are all listed, so nothing is hidden by
 * the floor.
 */
export function remainingOfMonth(salary: number, paid: number): number {
  return Math.max(0, Math.round((salary - paid) * 100) / 100);
}
