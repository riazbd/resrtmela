/**
 * The resort's payroll. The screen is `PayrollScreen`, shared with the
 * agency; this says which resort, which routes, which payment methods the
 * resort takes, and who may change anything (`payroll.manage`).
 */
import { useMemo } from "react";
import { Stack } from "expo-router";
import { keys, useApi, useQueryClient } from "@rh/app-core";
import { todayIn, type ResortOption } from "@rh/shared";
import { client, useAuth } from "../../../src/api/session";
import { WhichResort } from "../../../src/screens/which-resort";
import { PayrollScreen } from "../../../src/screens/payroll-screen";
import type { PayrollAdapter } from "../../../src/screens/payroll-adapter";

export default function PayrollRoute() {
  const { activeResort, can } = useAuth();
  const resortId = activeResort?.id;
  const qc = useQueryClient();
  const today = todayIn(activeResort?.timezone);

  const methods = useApi<ResortOption[]>(
    keys.options(resortId, "PAYMENT_METHOD"),
    () => client.options.list(resortId!, "PAYMENT_METHOD"),
    { enabled: resortId !== undefined, staleTime: 3_600_000 },
  );

  const adapter = useMemo<PayrollAdapter | null>(() => {
    if (resortId === undefined) return null;
    const rid = resortId;
    return {
      owner: "resort",
      ownerName: activeResort?.name ?? "",
      canManage: can("payroll.manage"),
      currentMonth: today.slice(0, 7),
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
      // every month's sheet, the year, the people — and the period's
      // figures, because wages are an expense
      invalidate: () =>
        Promise.all([
          qc.invalidateQueries({ queryKey: ["payroll", rid] }),
          qc.invalidateQueries({ queryKey: ["employees", rid] }),
          qc.invalidateQueries({ queryKey: ["reports"] }),
        ]),
    };
  }, [resortId, activeResort?.name, can, today, qc]);

  const header = <Stack.Screen options={{ title: "Payroll" }} />;
  if (!adapter) {
    return (
      <>
        {header}
        <WhichResort what="the month's wages" />
      </>
    );
  }
  const choices = (methods.data ?? []).filter((m) => m.active).map((m) => ({ code: m.code, label: m.label }));
  return (
    <>
      {header}
      <PayrollScreen a={adapter} methods={choices} today={today} />
    </>
  );
}
