/**
 * The month's wages: who is owed what, and handing it over.
 *
 * A month is the unit, and the sheet is the server's arithmetic over
 * it — `salary`, what has been `paid` against the month, how much of
 * that was an `advance`, and what is `remaining`. None of it is worked
 * out here, because a month can hold several payments and "settled"
 * means the salary has been handed over in full however many payments
 * it took, not that there is one payment row.
 *
 * Paying is on the phone because it is the thing that happens standing
 * in front of somebody with cash. Adding an employee and setting a
 * salary are not — those are a decision with a contract behind them.
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
  type PayrollSheet,
  type ResortOption,
} from "@rh/shared";
import { client, useAuth } from "../../../src/api/session";
import { WhichResort } from "../../../src/screens/which-resort";
import { Button } from "../../../src/design/button";
import { Chip } from "../../../src/design/chip";
import { Field, Input } from "../../../src/design/input";
import { useMoneyFormat } from "../../../src/design/money";
import { Empty, Loading, Problem, Stale } from "../../../src/design/states";
import { Card, Row, Stat } from "../../../src/design/surface";
import { Text } from "../../../src/design/text";
import { useAction } from "../../../src/design/use-action";
import { color, radius, space } from "../../../src/design/tokens";

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

  const [paying, setPaying] = useState<number | null>(null);
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState("CASH");
  const [refused, setRefused] = useState<string | null>(null);

  const sheet = useApi<PayrollSheet>(
    keys.payroll(resortId, month),
    () => client.payroll.sheet(resortId!, month),
    {
      enabled: resortId !== undefined,
      placeholderData: (prev: PayrollSheet | undefined) => prev,
    },
  );

  const methods = useApi<ResortOption[]>(
    keys.options(resortId, "PAYMENT_METHOD"),
    () => client.options.list(resortId!, "PAYMENT_METHOD"),
    { enabled: resortId !== undefined, staleTime: 3_600_000 },
  );

  const hand = useAction(async () => {
    if (paying === null || !(amount > 0)) return;
    setRefused(null);
    try {
      await client.payroll.pay(resortId!, paying, { month, amount, method });
      setPaying(null);
      setAmount(0);
      await sheet.refetch();
      // wages are an expense in the period's figures
      await qc.invalidateQueries({ queryKey: ["reports"] });
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That did not go through.");
    }
  });

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

  const { rows, totals } = sheet.data;
  const mayPay = can("payroll.manage");
  const choices = (methods.data ?? []).filter((m) => m.active);

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
            value={whole(Math.max(0, totals.expected - totals.paid))}
            tone={totals.expected - totals.paid > 0 ? "danger" : "title"}
          />
        </View>

        <Card title="The month">
          {rows.length === 0 ? (
            <View style={styles.emptyBox}>
              {/* the footnote below already says where staff are added;
                  saying it twice on one screen reads as a stutter */}
              <Empty message="Nobody on payroll" />
            </View>
          ) : (
            rows.map((row, i) => (
              <Row
                key={row.employeeId}
                title={row.name}
                subtitle={[
                  row.designation,
                  // an advance is money already handed over, and a month
                  // where somebody took one reads differently from one
                  // where they did not
                  row.advance > 0 ? `${whole(row.advance)} advanced` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || undefined}
                last={i === rows.length - 1}
                accessibilityLabel={`${row.name}, salary ${whole(row.salary)}, ${row.settled ? "settled" : `${whole(row.remaining)} left`}`}
                onPress={
                  mayPay && !row.settled
                    ? () => {
                        setPaying(paying === row.employeeId ? null : row.employeeId);
                        setAmount(row.remaining);
                        setRefused(null);
                      }
                    : undefined
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

        {paying !== null && mayPay ? (
          <Card title={`Hand over — ${rows.find((r) => r.employeeId === paying)?.name ?? ""}`}>
            <View style={styles.fields}>
              <Field
                label="Amount"
                hint="Less than what is left is an advance; the rest settles the month"
              >
                <Input
                  value={amount ? String(amount) : ""}
                  onChangeText={(text) => setAmount(Number(text.replace(/[^0-9.]/g, "")) || 0)}
                  placeholder="0"
                  keyboardType="numeric"
                />
              </Field>
              {choices.length > 0 ? (
                <View style={styles.kinds}>
                  {choices.map((m) => (
                    <Chip
                      key={m.code}
                      label={m.label}
                      on={method === m.code}
                      onPress={() => setMethod(m.code)}
                    />
                  ))}
                </View>
              ) : null}

              {refused ? (
                <View style={styles.refused}>
                  <Text step="small" tone="danger" weight="medium">
                    {refused}
                  </Text>
                </View>
              ) : null}

              <Button label={`Pay ${whole(amount)}`} loading={hand.busy} onPress={hand.go} />
              <Button label="Not now" kind="ghost" onPress={() => setPaying(null)} />
            </View>
          </Card>
        ) : null}

        <Text step="caption" tone="muted" style={styles.footnote}>
          Staff and their salaries are set up on the desk. A month is settled
          when the salary has been handed over in full, however many payments
          it took.
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  months: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  figures: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  fields: { gap: space.md },
  kinds: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
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
