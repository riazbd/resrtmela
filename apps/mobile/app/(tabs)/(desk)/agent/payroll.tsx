/**
 * The agency's month: who is owed what, and handing it over.
 *
 * The same sheet the resort side has, owned by an agency instead of a
 * resort, and against the same arithmetic on the server. A month can
 * hold several payments — somebody taking 2,000 on the 8th and 5,000 on
 * the 20th is ordinary payroll — so `remaining` and `settled` are the
 * server's answers and not this screen's.
 *
 * Paying is on the phone because it is what happens standing in front of
 * somebody with cash. Adding an employee and setting a salary are a
 * decision with a contract behind them, and they stay on the desk.
 */
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { useApi, useQueryClient } from "@rh/app-core";
import { MONTHS_LONG, formatMoney, shiftMonth, todayIn, type PayrollSheet } from "@rh/shared";
import { client, useAuth } from "../../../../src/api/session";
import { Button } from "../../../../src/design/button";
import { Field, Input } from "../../../../src/design/input";
import { useMoneyFormat } from "../../../../src/design/money";
import { Empty, Loading, Problem, Stale } from "../../../../src/design/states";
import { Card, Row, Stat } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { useAction } from "../../../../src/design/use-action";
import { color, radius, space } from "../../../../src/design/tokens";

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

  const [month, setMonth] = useState(() => todayIn(undefined).slice(0, 7));
  const [paying, setPaying] = useState<number | null>(null);
  const [amount, setAmount] = useState(0);
  const [refused, setRefused] = useState<string | null>(null);

  const sheet = useApi<PayrollSheet>(
    ["agent-payroll", month],
    () => client.agent.payroll.sheet(month),
    { enabled: Boolean(me) },
  );

  const pay = useAction(async () => {
    if (paying === null || !(amount > 0)) return;
    setRefused(null);
    try {
      await client.agent.payroll.pay(paying, { month, amount });
      setPaying(null);
      await qc.invalidateQueries({ queryKey: ["agent-payroll"] });
      await sheet.refetch();
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That did not go through.");
    }
  });

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

  const { rows, totals } = sheet.data;

  return (
    <>
      {header}
      <Stale age={sheet.stale} />
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={sheet.isRefetching} onRefresh={() => void sheet.refetch()} />
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

        <View style={styles.figures}>
          <Stat label="Owed" value={whole(totals.expected)} />
          <Stat label="Paid" value={whole(totals.paid)} tone="ok" />
          <Stat
            label="Left"
            value={whole(totals.remaining)}
            tone={totals.remaining > 0 ? "danger" : "title"}
          />
        </View>

        <Card title="The month">
          {rows.length === 0 ? (
            <View style={styles.emptyBox}>
              <Empty message="Nobody on payroll" />
            </View>
          ) : (
            rows.map((row, i) => (
              <Row
                key={row.employeeId}
                title={row.name}
                subtitle={
                  [
                    row.designation,
                    // an advance is money already handed over, and a month
                    // where somebody took one reads differently
                    row.advance > 0 ? `${whole(row.advance)} advanced` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || undefined
                }
                last={i === rows.length - 1}
                accessibilityLabel={`${row.name}, salary ${whole(row.salary)}, ${
                  row.settled ? "settled" : `${whole(row.remaining)} left`
                }`}
                onPress={
                  row.settled
                    ? undefined
                    : () => {
                        setPaying(paying === row.employeeId ? null : row.employeeId);
                        setAmount(row.remaining);
                        setRefused(null);
                      }
                }
                right={
                  row.settled ? (
                    <Text step="small" weight="medium" tone="ok">
                      Settled
                    </Text>
                  ) : (
                    <Text step="body" weight="medium" tone="danger" tabular>
                      {whole(row.remaining)}
                    </Text>
                  )
                }
              />
            ))
          )}
        </Card>

        {paying !== null ? (
          <Card title="Handing it over">
            <View style={styles.fields}>
              <Field label="Amount">
                <Input
                  value={amount ? String(amount) : ""}
                  onChangeText={(text) => setAmount(Number(text.replace(/[^0-9.]/g, "")) || 0)}
                  keyboardType="numeric"
                  placeholder="0"
                />
              </Field>
              {refused ? (
                <View style={styles.refused}>
                  <Text step="small" tone="danger" weight="medium">
                    {refused}
                  </Text>
                </View>
              ) : null}
              <Button label="Pay" loading={pay.busy} onPress={pay.go} />
            </View>
          </Card>
        ) : null}

        <Text step="caption" tone="muted" style={styles.footnote}>
          Adding somebody and setting a salary stay on the desk. Those are a
          decision with a contract behind them, not something to do one-handed.
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  months: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  figures: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  fields: { gap: space.md },
  emptyBox: { paddingVertical: space.lg },
  footnote: { textAlign: "center" },
  refused: {
    backgroundColor: color.danger.bg,
    borderWidth: 1,
    borderColor: color.danger.line,
    borderRadius: radius.md,
    padding: space.md,
  },
});
