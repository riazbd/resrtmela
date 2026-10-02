/**
 * What the platform is owed — the console's Dues tab on the phone:
 * subscription bills and one-off charges, each marked paid after saying how
 * the money arrived, and the billing sweep run by hand.
 */
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { keys, useApi, useQueryClient } from "@rh/app-core";
import { dayLabel, formatMoney, type PlatformChargeRow, type SubscriptionDueRow } from "@rh/shared";
import { client } from "../../../../src/api/session";
import { HowItArrived, Pill, Said, useRun } from "../../../../src/screens/platform-kit";
import { Button } from "../../../../src/design/button";
import { Kpi } from "../../../../src/design/charts";
import { Lenses } from "../../../../src/design/lenses";
import { useMoneyFormat } from "../../../../src/design/money";
import { Empty, Loading } from "../../../../src/design/states";
import { Card } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { color, elevation, radius, space } from "../../../../src/design/tokens";

export default function PlatformDues() {
  const qc = useQueryClient();
  const fmt = useMoneyFormat();
  const money = (n: number) => formatMoney(n, { ...fmt, decimals: 0 });
  const dues = useApi<SubscriptionDueRow[]>(keys.platform("dues"), () => client.platform.dues());
  const charges = useApi<PlatformChargeRow[]>(keys.platform("charges"), () => client.platform.charges());
  const { run, busy, said } = useRun(() => qc.invalidateQueries({ queryKey: ["platform"] }));
  const [view, setView] = useState<"Bills" | "Charges">("Bills");
  const [collecting, setCollecting] = useState<{ what: string; pay: (m: string) => void } | null>(null);

  const header = <Stack.Screen options={{ title: "Dues" }} />;
  if (!dues.data && !charges.data) return (<>{header}<Loading what="the dues" /></>);
  const open = (dues.data ?? []).filter((d) => d.status !== "PAID");
  const openCharges = (charges.data ?? []).filter((c) => c.status !== "PAID");
  const owed = open.reduce((n, d) => n + Number(d.amount), 0) + openCharges.reduce((n, c) => n + c.amount, 0);
  const late = open.filter((d) => d.status === "OVERDUE").reduce((n, d) => n + Number(d.amount), 0);

  return (
    <>
      {header}
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={<RefreshControl refreshing={dues.isRefetching} onRefresh={() => { void dues.refetch(); void charges.refetch(); }} />}
      >
        <View style={styles.figures}>
          <Kpi label="To collect" value={money(owed)} tint={owed > 0 ? color.chart.money.left.solid : color.ink[400]} sub={`${open.length + openCharges.length} open`} />
          <Kpi label="Overdue" value={money(late)} tint={late > 0 ? color.chart.money.late.solid : color.ink[400]} />
        </View>
        <Button label="Run the billing sweep now" kind="ghost" loading={busy === "sweep"} onPress={() => void run("sweep", () => client.platform.runBillingSweep(), "Billing sweep run")} />
        <Said said={said} />
        {collecting ? (
          <HowItArrived
            what={collecting.what}
            onPick={(m) => {
              const { pay } = collecting;
              setCollecting(null);
              pay(m);
            }}
            onCancel={() => setCollecting(null)}
          />
        ) : null}
        <Lenses options={["Bills", "Charges"] as const} value={view} onChange={setView} countOf={(o) => (o === "Bills" ? open.length : openCharges.length)} />

        {view === "Bills"
          ? (dues.data ?? []).length === 0
            ? <Card><Empty message="No bills yet" /></Card>
            : (dues.data ?? []).map((d) => (
                <View key={d.id} style={styles.card}>
                  <View style={styles.head}>
                    <Text step="body" weight="bold" tone="title" style={styles.flex} numberOfLines={1}>
                      {d.account.name}
                    </Text>
                    <Pill value={d.status} />
                  </View>
                  <Text step="small" tone="body">{`${d.subscription.plan} · ${dayLabel(d.periodStart)} → ${dayLabel(d.periodEnd)}`}</Text>
                  <View style={styles.head}>
                    <Text step="caption" tone="muted" style={styles.flex}>
                      {d.status === "PAID" ? `Paid ${d.paidAt ? dayLabel(d.paidAt) : ""}${d.paidMethod ? ` · ${d.paidMethod}` : ""}` : `Due ${dayLabel(d.dueDate)}`}
                    </Text>
                    <Text step="strong" weight="bold" tone={d.status === "PAID" ? "ok" : d.status === "OVERDUE" ? "danger" : "title"} tabular>
                      {money(Number(d.amount))}
                    </Text>
                  </View>
                  {d.status !== "PAID" ? (
                    <Button
                      label="Mark paid"
                      kind="ghost"
                      onPress={() =>
                        setCollecting({
                          what: `${d.account.name} · ${d.subscription.plan} — ${money(Number(d.amount))}`,
                          pay: (m) => void run(`d${d.id}`, () => client.platform.payDue(Number(d.id), m), "Marked paid"),
                        })
                      }
                    />
                  ) : null}
                </View>
              ))
          : (charges.data ?? []).length === 0
            ? <Card><Empty message="No one-off charges" /></Card>
            : (charges.data ?? []).map((c) => (
                <View key={c.id} style={styles.card}>
                  <View style={styles.head}>
                    <Text step="body" weight="bold" tone="title" style={styles.flex} numberOfLines={1}>
                      {c.account.name}
                    </Text>
                    <Pill value={c.status} />
                  </View>
                  <Text step="small" tone="body">{`${c.description}${c.resort ? ` · ${c.resort.name}` : ""}`}</Text>
                  <View style={styles.head}>
                    <Text step="caption" tone="muted" style={styles.flex}>{`Raised ${dayLabel(c.createdAt)}`}</Text>
                    <Text step="strong" weight="bold" tone={c.status === "PAID" ? "ok" : "title"} tabular>
                      {money(c.amount)}
                    </Text>
                  </View>
                  {c.status !== "PAID" ? (
                    <Button
                      label="Mark paid"
                      kind="ghost"
                      onPress={() =>
                        setCollecting({
                          what: `${c.account.name} · ${c.description} — ${money(c.amount)}`,
                          pay: (m) => void run(`c${c.id}`, () => client.platform.payCharge(c.id, m), "Marked paid"),
                        })
                      }
                    />
                  ) : null}
                </View>
              ))}
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
