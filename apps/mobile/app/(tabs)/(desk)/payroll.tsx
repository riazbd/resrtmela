/**
 * The month's wages: who is owed what, handing it over, and who is on it.
 *
 * A month is the unit, and the sheet is the server's arithmetic over it —
 * `salary`, what has been `paid` against the month, how much of that was an
 * `advance`, and what is `remaining`. None of it is worked out here, because
 * a month can hold several payments and "settled" means the salary has been
 * handed over in full however many payments it took.
 *
 * The month and the staff are drawn by `PayrollMonth` and `PayrollStaff`,
 * shared with the agency's payroll; this screen keeps which resort, which
 * routes, and who may change anything (`payroll.manage`).
 */
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { keys, useApi, useQueryClient } from "@rh/app-core";
import {
  MONTHS_LONG,
  formatMoney,
  shiftMonth,
  todayIn,
  type Employee,
  type PayrollSheet,
  type ResortOption,
} from "@rh/shared";
import { client, useAuth } from "../../../src/api/session";
import { WhichResort } from "../../../src/screens/which-resort";
import { PayrollFigures, PayrollMonth, PayrollStaff } from "../../../src/screens/payroll-month";
import { Button } from "../../../src/design/button";
import { useMoneyFormat } from "../../../src/design/money";
import { Loading, Problem, Stale } from "../../../src/design/states";
import { Text } from "../../../src/design/text";
import { space } from "../../../src/design/tokens";

/** "September 2026" from "2026-09". */
function monthName(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return `${MONTHS_LONG[(m ?? 1) - 1] ?? month} ${year ?? ""}`.trim();
}

export default function PayrollScreen() {
  const { activeResort, can } = useAuth();
  const resortId = activeResort?.id;
  const money = useMoneyFormat();
  const whole = (n: number) => formatMoney(n, { ...money, decimals: 0 });
  const qc = useQueryClient();

  /** `null` is the resort's current month, resolved on read. */
  const [chosen, setMonth] = useState<string | null>(null);
  const month = chosen ?? todayIn(activeResort?.timezone).slice(0, 7);

  const sheet = useApi<PayrollSheet>(
    keys.payroll(resortId, month),
    () => client.payroll.sheet(resortId!, month),
    {
      enabled: resortId !== undefined,
      placeholderData: (prev: PayrollSheet | undefined) => prev,
    },
  );

  const staff = useApi<Employee[]>(
    keys.employees(resortId),
    () => client.payroll.employees(resortId!),
    { enabled: resortId !== undefined },
  );

  const methods = useApi<ResortOption[]>(
    keys.options(resortId, "PAYMENT_METHOD"),
    () => client.options.list(resortId!, "PAYMENT_METHOD"),
    { enabled: resortId !== undefined, staleTime: 3_600_000 },
  );

  /** Every month's sheet, the staff list, and the period's figures — wages are an expense. */
  const reload = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["payroll", resortId] }),
      qc.invalidateQueries({ queryKey: ["employees", resortId] }),
      qc.invalidateQueries({ queryKey: ["reports"] }),
    ]);
  };

  const header = <Stack.Screen options={{ title: "Payroll" }} />;

  if (resortId === undefined) {
    return (
      <>
        {header}
        <WhichResort what="the month's wages" />
      </>
    );
  }

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
        <Loading what="the month's wages" />
      </>
    );
  }

  const mayManage = can("payroll.manage");
  const choices = (methods.data ?? [])
    .filter((m) => m.active)
    .map((m) => ({ code: m.code, label: m.label }));

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

        <PayrollMonth
          // a different month is a different sheet; nothing half-typed carries over
          key={month}
          sheet={sheet.data}
          month={month}
          monthName={monthName(month)}
          mayManage={mayManage}
          methods={choices}
          whole={whole}
          pay={(employeeId, body) => client.payroll.pay(resortId, employeeId, body)}
          undo={(paymentId) => client.payroll.unpay(paymentId)}
          onDone={reload}
        />

        <PayrollStaff
          people={staff.data ?? []}
          mayManage={mayManage}
          whole={whole}
          add={(body) => client.payroll.addEmployee(resortId, body)}
          edit={(id, body) => client.payroll.updateEmployee(resortId, id, body)}
          remove={(id) => client.payroll.removeEmployee(resortId, id)}
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
  months: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  footnote: { textAlign: "center" },
});
