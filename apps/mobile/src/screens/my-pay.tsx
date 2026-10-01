/**
 * Your own pay, if you are on somebody's payroll — the phone's half of the
 * console's card (`apps/web/src/components/my-pay.tsx`).
 *
 * A login linked to a person on payroll sees each month as the owner does:
 * what it was worth, what was handed over, what is left. Nothing shows for
 * anybody who is not on a payroll.
 */
import { StyleSheet, View } from "react-native";
import { keys, useApi } from "@rh/app-core";
import { formatMoney, monthName, percentOf, type MyPay } from "@rh/shared";
import { client } from "../api/session";
import { useMoneyFormat } from "../design/money";
import { Card } from "../design/surface";
import { Text } from "../design/text";
import { color, radius, space } from "../design/tokens";
import { StatePill } from "./payroll-month";

export function MyPayCards() {
  const money = useMoneyFormat();
  const whole = (n: number) => formatMoney(n, { ...money, decimals: 0 });
  const q = useApi<MyPay>(keys.myPay(), () => client.payroll.mine());
  const places = q.data?.places ?? [];
  if (places.length === 0) return null;
  return (
    <>
      {places.map((p) => (
        <Card key={p.employeeId} title={`My pay — ${p.employer}`}>
          <Text step="small" tone="muted">
            {`${p.designation ? `${p.designation} · ` : ""}${whole(p.salary)} a month`}
          </Text>
          {p.months.map((m) => (
            <View
              key={m.month}
              style={styles.month}
              accessible
              accessibilityLabel={`${monthName(m.month)}: worth ${whole(m.due)}, received ${whole(m.paid)}, ${whole(m.remaining)} left`}
            >
              <View style={styles.head}>
                <Text step="body" weight="medium" tone="title" style={styles.flex}>
                  {monthName(m.month)}
                </Text>
                <StatePill state={m.state} />
              </View>
              <View style={styles.track}>
                <View style={{ width: `${Math.min(100, percentOf(m.paid, m.due))}%`, backgroundColor: color.chart.money.paid.solid }} />
              </View>
              <Text step="caption" tone="muted" tabular>
                {[
                  `Worth ${whole(m.due)}`,
                  `received ${whole(m.paid)}`,
                  m.bonus > 0 ? `bonus ${whole(m.bonus)}` : null,
                  m.deduction > 0 ? `deduction ${whole(m.deduction)}` : null,
                  `left ${whole(m.remaining)}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </View>
          ))}
        </Card>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  month: { gap: space.xs, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: color.line },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  track: { height: 6, flexDirection: "row", borderRadius: radius.pill, overflow: "hidden", backgroundColor: color.ink[100] },
});
