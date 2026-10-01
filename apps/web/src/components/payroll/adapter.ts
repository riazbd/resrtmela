/**
 * What a payroll screen needs from whoever owns the payroll.
 *
 * A resort and an agency run the same payroll against the same book on the
 * server (`payroll-book.ts`); what differs is which URLs, which cache keys
 * and who may change things. The screens take one of these and do not know
 * which of the two they are drawing.
 */
import type {
  EmployeeEdit,
  NewEmployee,
  PayrollAdjust,
  PayrollPay,
  PayrollPeople,
  PayrollSheet,
  PayrollYear,
} from "@rh/shared";

export interface PayrollAdapter {
  /** "resort" shows Agents as the people who are not here; "agency" its own words */
  owner: "resort" | "agency";
  ownerName: string;
  canManage: boolean;
  /** "YYYY-MM-DD" where the payroll is kept — the resort's day, or Dhaka's for an agency */
  today: string;
  sheetKey: (month: string) => readonly unknown[];
  sheet: (month: string) => Promise<PayrollSheet>;
  yearKey: (year: number) => readonly unknown[];
  year: (year: number) => Promise<PayrollYear>;
  peopleKey: readonly unknown[];
  people: () => Promise<PayrollPeople>;
  pay: (employeeId: number, body: PayrollPay) => Promise<unknown>;
  undoPay: (paymentId: number) => Promise<unknown>;
  adjust: (employeeId: number, body: PayrollAdjust) => Promise<unknown>;
  unadjust: (adjustmentId: number) => Promise<unknown>;
  addEmployee: (body: NewEmployee) => Promise<unknown>;
  editEmployee: (employeeId: number, body: EmployeeEdit) => Promise<unknown>;
  removeEmployee: (employeeId: number, leftDate?: string) => Promise<{ deleted?: boolean; deactivated?: boolean }>;
  /** everything payroll-shaped in the cache, after a change */
  invalidate: () => void;
}
