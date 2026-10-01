/**
 * What a payroll screen needs from whoever owns the payroll — a resort or an
 * agency. Both run the same book on the server; what differs is which calls,
 * which cache keys and who may change things. The console has the same seam
 * (`apps/web/src/components/payroll/adapter.ts`).
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
  owner: "resort" | "agency";
  ownerName: string;
  canManage: boolean;
  /** "2026-10": the month it is now where the payroll is kept */
  currentMonth: string;
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
  invalidate: () => Promise<unknown>;
}
