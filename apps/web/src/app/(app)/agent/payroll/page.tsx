"use client";

import { useMemo } from "react";
import { PLATFORM_TIMEZONE, todayIn } from "@rh/shared";
import { client } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { keys, useQueryClient } from "@/lib/query";
import { Empty } from "@/components/ui";
import { PayrollConsole } from "@/components/payroll/payroll-console";
import type { PayrollAdapter } from "@/components/payroll/adapter";

/**
 * The agency's payroll: the same screen the resort has, owned by an agency —
 * the same component, against the same book on the server.
 */
export default function AgencyPayrollPage() {
  const { role, can, me } = useAuth();
  const qc = useQueryClient();

  const adapter = useMemo<PayrollAdapter>(
    () => ({
      owner: "agency",
      ownerName: me?.account?.name ?? me?.name ?? "",
      canManage: true,
      today: todayIn(PLATFORM_TIMEZONE),
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
      invalidate: () => {
        void qc.invalidateQueries({ queryKey: ["agent"] });
      },
    }),
    [me?.account?.name, me?.name, qc],
  );

  if (role !== "AGENT") return <Empty msg="Agents only" />;
  if (!can("agent.payroll.manage")) return <Empty msg="You do not have access to the agency's payroll" />;
  return <PayrollConsole a={adapter} subtitle="Everyone the agency pays a salary" />;
}
