"use client";

import { useMemo } from "react";
import { todayIn } from "@rh/shared";
import { client } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { keys, useQueryClient } from "@/lib/query";
import { Empty } from "@/components/ui";
import { PayrollConsole } from "@/components/payroll/payroll-console";
import type { PayrollAdapter } from "@/components/payroll/adapter";

/**
 * The resort's payroll. The screen itself is `PayrollConsole`, shared with
 * the agency; this says which resort, which calls, and who may change things.
 */
export default function PayrollPage() {
  const { activeResort, isStaff, can } = useAuth();
  const qc = useQueryClient();
  const rid = activeResort?.id;

  const adapter = useMemo<PayrollAdapter | null>(() => {
    if (!rid) return null;
    return {
      owner: "resort",
      ownerName: activeResort?.name ?? "",
      canManage: isStaff && can("payroll.manage"),
      today: todayIn(activeResort?.timezone),
      sheetKey: (month) => keys.payroll(rid, month),
      sheet: (month) => client.payroll.sheet(rid, month),
      yearKey: (year) => keys.payrollYear(rid, year),
      year: (year) => client.payroll.year(rid, year),
      peopleKey: keys.payrollPeople(rid),
      people: () => client.payroll.people(rid),
      pay: (employeeId, body) => client.payroll.pay(rid, employeeId, body),
      undoPay: (paymentId) => client.payroll.unpay(paymentId),
      adjust: (employeeId, body) => client.payroll.adjust(rid, employeeId, body),
      unadjust: (adjustmentId) => client.payroll.unadjust(adjustmentId),
      addEmployee: (body) => client.payroll.addEmployee(rid, body),
      editEmployee: (employeeId, body) => client.payroll.updateEmployee(rid, employeeId, body),
      removeEmployee: (employeeId, leftDate) => client.payroll.removeEmployee(rid, employeeId, leftDate),
      invalidate: () => {
        void qc.invalidateQueries({ queryKey: ["payroll", rid] });
        void qc.invalidateQueries({ queryKey: ["employees", rid] });
        // payroll is an expense line in the P&L
        void qc.invalidateQueries({ queryKey: ["reports", rid] });
      },
    };
  }, [rid, activeResort?.name, activeResort?.timezone, isStaff, can, qc]);

  if (!isStaff) return <Empty msg="Staff only" />;
  if (!adapter) return null;
  return <PayrollConsole a={adapter} subtitle={`${activeResort?.name} — everyone the resort pays a salary`} />;
}
