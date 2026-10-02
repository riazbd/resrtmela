/**
 * Every subscription the platform has sold, live and closed — the console's
 * Subscriptions tab on the phone: who, on what plan and term, its state, what
 * a month is worth, when it renews, and what is still owed against it.
 */
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { keys, useApi } from "@rh/app-core";
import { dayLabel, formatMoney, type PlatformSubscriptionRow } from "@rh/shared";
import { client } from "../../../../src/api/session";
import { Pill } from "../../../../src/screens/platform-kit";
import { Kpi, SplitBar } from "../../../../src/design/charts";
import { Input } from "../../../../src/design/input";
import { useMoneyFormat } from "../../../../src/design/money";
import { Empty, Loading, Problem } from "../../../../src/design/states";
import { Card } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { color, elevation, radius, space } from "../../../../src/design/tokens";

export default function PlatformSubscriptions() {
  const fmt = useMoneyFormat();
  const money = (n: number) => formatMoney(n, { ...fmt, decimals: 0 });
  const subs = useApi<PlatformSubscriptionRow[]>(keys.platform("subscriptions"), () => client.platform.subscriptions());
  const [q, setQ] = useState("");
  const header = <Stack.Screen options={{ title: "Subscriptions" }} />;
  if (subs.error && !subs.data) return (<>{header}<Problem error={subs.error} onRetry={() => void subs.refetch()} /></>);
  if (!subs.data) return (<>{header}<Loading what="the subscriptions" /></>);
  const all = subs.data;
  const rows = all.filter((s) => !q.trim() || `${s.account.name} ${s.plan}`.toLowerCase().includes(q.trim().toLowerCase()));
  const count = (st: string) => all.filter((s) => s.status === st).length;
  const owed = all.reduce((n, s) => n + s.outstanding, 0);

  return (
    <>
      {header}
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={subs.isRefetching} onRefresh={() => void subs.refetch()} />}>
        <View style={styles.figures}>
          <Kpi label="Subscriptions" value={String(all.length)} tint={color.title} />
          <Kpi label="Outstanding" value={money(owed)} tint={owed > 0 ? color.chart.money.late.solid : color.ink[400]} />
        </View>
        <Card title="By state">
          <SplitBar
            format={(n) => String(n)}
            parts={[
              { label: "Trial", value: count("TRIAL"), color: color.ink[400] },
              { label: "Active", value: count("ACTIVE"), color: color.chart.money.paid.solid },
              { label: "Past due", value: count("PAST_DUE"), color: color.chart.money.left.solid },
              { label: "Cancelled", value: count("CANCELLED"), color: color.chart.money.late.solid },
            ]}
          />
        </Card>
        <Input value={q} onChangeText={setQ} placeholder="Find a customer or a plan" accessibilityLabel="Find a subscription" />
        {rows.length === 0 ? (
          <Card>
            <Empty message="Nothing matches" />
          </Card>
        ) : (
          rows.map((s) => (
            <View key={s.id} style={styles.card}>
              <View style={styles.head}>
                <View style={styles.flex}>
                  <Text step="body" weight="bold" tone="title" numberOfLines={1}>
                    {s.account.name}
                  </Text>
                  <Text step="caption" tone="muted">{`${s.account.kind.toLowerCase()}${s.account.status !== "active" ? ` · ${s.account.status}` : ""}`}</Text>
                </View>
                <Pill value={s.status} />
              </View>
              <Text step="small" tone="body">
                {`${s.plan}${s.scheduleLabel ? ` · ${s.scheduleLabel}` : ""} · ${money(s.fee)}`}
                {s.pendingPlan ? ` → ${s.pendingPlan} at renewal` : ""}
                {s.pendingScheduleLabel ? ` → ${s.pendingScheduleLabel}` : ""}
              </Text>
              <Text step="caption" tone="muted">
                {`Started ${dayLabel(s.startedAt)}${s.trialEndsAt ? ` · trial ends ${dayLabel(s.trialEndsAt)}` : ""}${s.renewsAt ? ` · renews ${dayLabel(s.renewsAt)}` : ""}`}
              </Text>
              {s.outstanding > 0 ? (
                <Text step="small" weight="bold" tone="danger">{`${money(s.outstanding)} outstanding`}</Text>
              ) : null}
              {s.note ? (
                <Text step="caption" tone="muted">
                  {s.note}
                </Text>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  figures: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  flex: { flex: 1 },
  card: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, gap: 4, borderWidth: 1, borderColor: color.ink[100], ...elevation.raised },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
