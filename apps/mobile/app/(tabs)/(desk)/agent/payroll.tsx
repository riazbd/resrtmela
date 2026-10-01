/**
 * The agency's month: who is owed what, handing it over, and who is on it.
 *
 * The same sheet the resort side has, owned by an agency instead of a
 * resort, against the same arithmetic on the server, and drawn by the same
 * two pieces (`PayrollMonth`, `PayrollStaff`). An agency's staff take
 * advances for the reasons a resort's do. What this screen keeps is the
 * agency's routes and its list of payment methods — an agency has no
 * options table to read one from.
 */
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { useApi, useQueryClient } from "@rh/app-core";
import {
  MONTHS_LONG,
  PLATFORM_TIMEZONE,
  formatMoney,
  shiftMonth,
  todayIn,
  type AgencyEmployee,
  type PayrollSheet,
} from "@rh/shared";
import { client, useAuth } from "../../../../src/api/session";
import {
  AGENCY_PAY_METHODS,
  PayrollFigures,
  PayrollMonth,
  PayrollStaff,
} from "../../../../src/screens/payroll-month";
import { Button } from "../../../../src/design/button";
import { useMoneyFormat } from "../../../../src/design/money";
import { Loading, Problem, Stale } from "../../../../src/design/states";
import { Text } from "../../../../src/design/text";
import { space } from "../../../../src/design/tokens";

/** "September 2026" from "2026-09". */
function monthName(month: string): string {
  const [year, mm] = month.split("-");
  return `${MONTHS_LONG[Number(mm) - 1]} ${year}`;
}

export default function AgentPayrollScreen() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const money = useMoneyFormat();
  const whole = (n: number) => formatMoney(n, { ...money, decimals: 0 });

  const [month, setMonth] = useState(() => todayIn(PLATFORM_TIMEZONE).slice(0, 7));

  const sheet = useApi<PayrollSheet>(
    ["agent-payroll", month],
    () => client.agent.payroll.sheet(month),
    { enabled: Boolean(me), placeholderData: (prev: PayrollSheet | undefined) => prev },
  );

  const staff = useApi<AgencyEmployee[]>(
    ["agent-employees"],
    () => client.agent.payroll.employees(),
    { enabled: Boolean(me) },
  );

  const reload = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["agent-payroll"] }),
      qc.invalidateQueries({ queryKey: ["agent-employees"] }),
    ]);
  };

  const header = <Stack.Screen options={{ title: "Payroll" }} />;

  if (sheet.error && !sheet.data) {
    return (
      <>
        {header}
        <Problem error={sheet.error} onRetry={() => void sheet.refetch()} />
      </>
    );
  }

  if (!sheet.data) {
    return (
      <>
        {header}
        <Loading what="the month" />
      </>
    );
  }

  return (
    <>
      {header}
      <Stale age={sheet.stale} />
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={sheet.isRefetching}
            onRefresh={() => {
              void sheet.refetch();
              void staff.refetch();
            }}
          />
        }
      >
        <View style={styles.months}>
          <Button
            label="‹ Prev"
            kind="ghost"
            block={false}
            onPress={() => setMonth(shiftMonth(month, -1))}
          />
          <Text step="body" weight="medium" tone="title">
            {monthName(month)}
          </Text>
          <Button
            label="Next ›"
            kind="ghost"
            block={false}
            onPress={() => setMonth(shiftMonth(month, 1))}
          />
        </View>

        <PayrollFigures sheet={sheet.data} whole={whole} />

        {/* the route is the gate: only somebody with agent.payroll.manage
            reaches this screen, as on the console */}
        <PayrollMonth
          key={month}
          sheet={sheet.data}
          month={month}
          monthName={monthName(month)}
          mayManage
          methods={AGENCY_PAY_METHODS}
          whole={whole}
          pay={(employeeId, body) => client.agent.payroll.pay(employeeId, body)}
          undo={(paymentId) => client.agent.payroll.undoPay(paymentId)}
          onDone={reload}
        />

        <PayrollStaff
          people={staff.data ?? []}
          mayManage
          whole={whole}
          add={(body) => client.agent.payroll.addEmployee(body)}
          edit={(id, body) => client.agent.payroll.editEmployee(id, body)}
          remove={(id) => client.agent.payroll.removeEmployee(id)}
          onDone={reload}
        />

        <Text step="caption" tone="muted" style={styles.footnote}>
          A month is settled when the salary has been handed over in full,
          however many payments it took.
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  months: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  footnote: { textAlign: "center" },
});
