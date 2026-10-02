/**
 * What the platform received — the console's Money received tab on the
 * phone: the whole, who took it, and every payment, newest first.
 */
import { RefreshControl, ScrollView, StyleSheet } from "react-native";
import { Stack } from "expo-router";
import { keys, useApi } from "@rh/app-core";
import { PLATFORM_MONEY_KIND, dayLabel, formatMoney, type PlatformMoneyReceived } from "@rh/shared";
import { client } from "../../../../src/api/session";
import { BarList, Kpi, Shares } from "../../../../src/design/charts";
import { useMoneyFormat } from "../../../../src/design/money";
import { Empty, Loading, Problem } from "../../../../src/design/states";
import { Card, Row } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { color, space } from "../../../../src/design/tokens";

export default function PlatformMoney() {
  const fmt = useMoneyFormat();
  const money = (n: number) => formatMoney(n, { ...fmt, decimals: 0 });
  const q = useApi<PlatformMoneyReceived>(keys.platform("money-received"), () => client.platform.moneyReceived());
  const header = <Stack.Screen options={{ title: "Money received" }} />;
  if (q.error && !q.data) return (<>{header}<Problem error={q.error} onRetry={() => void q.refetch()} /></>);
  if (!q.data) return (<>{header}<Loading what="the money received" /></>);
  const d = q.data;
  const byKind = Object.keys(PLATFORM_MONEY_KIND).map((k, i) => ({
    label: PLATFORM_MONEY_KIND[k]!,
    value: d.recent.filter((r) => r.kind === k).reduce((n, r) => n + r.amount, 0),
    color: color.chart.series[i]!,
  }));

  return (
    <>
      {header}
      <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
        <Kpi label="Received" value={money(d.total)} tint={color.chart.money.paid.solid} />
        {byKind.some((k) => k.value > 0) ? (
          <Card title="What it was for (latest)">
            <Shares format={money} parts={byKind} />
          </Card>
        ) : null}
        <Card title="Who took it">
          <BarList format={money} barColor={color.chart.money.income.solid} rows={d.rows.map((r) => ({ label: r.name, sub: `${r.count}`, value: r.total }))} />
        </Card>
        <Card title="Every payment">
          {d.recent.length === 0 ? (
            <Empty message="Nothing received yet" />
          ) : (
            d.recent.map((r, i) => (
              <Row
                key={`${r.kind}-${r.id}`}
                title={r.from}
                subtitle={`${r.what.startsWith(PLATFORM_MONEY_KIND[r.kind] ?? "") ? r.what : `${PLATFORM_MONEY_KIND[r.kind] ?? r.kind} · ${r.what}`}${r.method ? ` · ${r.method}` : ""}`}
                meta={[r.at ? dayLabel(r.at) : null, r.receivedBy ? `taken by ${r.receivedBy}` : null, r.note].filter(Boolean).join(" · ") || undefined}
                last={i === d.recent.length - 1}
                accessibilityLabel={`${money(r.amount)} from ${r.from}`}
                right={
                  <Text step="body" weight="bold" tone="ok" tabular>
                    {money(r.amount)}
                  </Text>
                }
              />
            ))
          )}
        </Card>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
});
