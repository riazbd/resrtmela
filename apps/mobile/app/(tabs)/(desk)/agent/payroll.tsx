/**
 * The agency's payroll: the same screen the resort has (`PayrollScreen`),
 * owned by an agency, against the same book on the server. What this keeps is
 * the agency's routes and its list of payment methods — an agency has no
 * options table to read one from.
 *
 * The route is the gate: only somebody with agent.payroll.manage reaches this
 * screen, as on the console.
 */
import { useMemo } from "react";
import { Stack } from "expo-router";
import { keys, useQueryClient } from "@rh/app-core";
import { PLATFORM_TIMEZONE, todayIn } from "@rh/shared";
import { client, useAuth } from "../../../../src/api/session";
import { AGENCY_PAY_METHODS } from "../../../../src/screens/payroll-month";
import { PayrollScreen } from "../../../../src/screens/payroll-screen";
import type { PayrollAdapter } from "../../../../src/screens/payroll-adapter";

export default function AgentPayrollScreen() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const today = todayIn(PLATFORM_TIMEZONE);

  const adapter = useMemo<PayrollAdapter>(
    () => ({
      owner: "agency",
      ownerName: me?.account?.name ?? me?.name ?? "",
      canManage: true,
      currentMonth: today.slice(0, 7),
      sheetKey: (month) => keys.agentPayroll(month),
      sheet: (month) => client.agent.payroll.sheet(month),
      yearKey: (year) => keys.agentPayrollYear(year),
      year: (year) => client.agent.payroll.year(year),
      peopleKey: keys.agentPayrollPeople(),
      people: () => client.agent.payroll.people(),
      pay: (employeeId, body) => client.agent.payroll.pay(employeeId, body),
      undoPay: (paymentId) => client.agent.payroll.undoPay(paymentId),
      adjust: (employeeId, body) => client.agent.payroll.adjust(employeeId, body),
      unadjust: (adjustmentId) => client.agent.payroll.unadjust(adjustmentId),
      addEmployee: (body) => client.agent.payroll.addEmployee(body),
      editEmployee: (employeeId, body) => client.agent.payroll.editEmployee(employeeId, body),
      removeEmployee: (employeeId, leftDate) => client.agent.payroll.removeEmployee(employeeId, leftDate),
      invalidate: () => qc.invalidateQueries({ queryKey: ["agent"] }),
    }),
    [me?.account?.name, me?.name, today, qc],
  );

  return (
    <>
      <Stack.Screen options={{ title: "Payroll" }} />
      <PayrollScreen a={adapter} methods={AGENCY_PAY_METHODS} today={today} />
    </>
  );
}
