/**
 * One month of one person's payroll, counted once.
 *
 * A resort and an agency both run payroll, through two services that have
 * always been near-copies of each other. That was tolerable while a month held
 * a single payment and the answer was a boolean; it is not now that the answer
 * is four numbers that have to agree — what is owed, what has been handed over,
 * how much of it was early, and what is left.
 *
 * Two copies of that arithmetic is how a resort's sheet and an agency's come to
 * disagree about whether a month is closed. So the counting lives here and both
 * call it; only the permission check and the audit line stay with each caller,
 * because those genuinely differ.
 */
import { isPayrollPaymentKind, remainingOfMonth, type PayrollPaymentKind } from "@rh/shared";
import { badRequest } from "../common/rbac";
import { round2 } from "../common/dates";

/** A payroll payment, as much of one as this file needs. */
export interface PaymentRow {
  id: number;
  amount: unknown;
  kind: string;
  method: string | null;
  note: string | null;
  paidAt: Date;
}

/**
 * The kind a request asked for, refused if it is not one we have.
 *
 * Absent means SALARY — that is what every caller written before advances
 * existed meant, and what every row already in the table is.
 */
export function paymentKind(value: string | undefined): PayrollPaymentKind {
  if (value == null || value === "") return "SALARY";
  if (!isPayrollPaymentKind(value)) {
    throw badRequest("A payroll payment is either an advance or a salary");
  }
  return value;
}

/** What has been handed over for this month already. */
export async function paidSoFar(
  prisma: { payrollPayment: { findMany(args: unknown): Promise<{ amount: unknown }[]> } },
  employeeId: number,
  month: string,
): Promise<number> {
  const rows = await prisma.payrollPayment.findMany({
    where: { employeeId, month },
    select: { amount: true },
  });
  return round2(rows.reduce((sum, r) => sum + Number(r.amount), 0));
}

/** One line of the sheet. */
export function monthRow(
  employeeId: number,
  name: string,
  designation: string | null,
  salary: number,
  payments: PaymentRow[],
) {
  const paid = round2(payments.reduce((sum, p) => sum + Number(p.amount), 0));
  const advance = round2(
    payments.filter((p) => p.kind === "ADVANCE").reduce((sum, p) => sum + Number(p.amount), 0),
  );
  return {
    employeeId,
    name,
    designation,
    salary,
    paid,
    advance,
    remaining: remainingOfMonth(salary, paid),
    /**
     * Settled means the salary has been handed over in full, however many
     * payments it took. It is deliberately not "a SALARY row exists": a month
     * covered entirely by advances is a month the resort owes nothing on, and
     * a sheet that still showed it as outstanding would be asking somebody to
     * pay twice.
     */
    settled: paid + 0.001 >= salary && salary > 0,
    payments: payments.map((p) => ({
      id: p.id,
      kind: p.kind,
      amount: Number(p.amount),
      method: p.method,
      note: p.note,
      paidAt: p.paidAt,
    })),
  };
}

/**
 * What a settlement with no amount comes to: the rest of the month.
 *
 * Defaulting to the salary would hand somebody their whole wage on top of the
 * advances they already have, which is the one mistake this exists to prevent.
 */
export function settlementAmount(salary: number, paid: number, name: string, month: string): number {
  const owed = remainingOfMonth(salary, paid);
  if (owed <= 0) {
    throw badRequest(`${name} has already had the whole salary for ${month} — record an advance instead.`);
  }
  return owed;
}
