/**
 * What the platform sells — the console's Plans tab on the phone. Each plan
 * is a card that shows what it costs, what it opens and its limits at a
 * glance; opened, it is the same editor the console has: the price ladder,
 * the ticks, the caps, retire or delete. And a new plan, made here.
 */
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { keys, useApi, useQueryClient } from "@rh/app-core";
import { PLAN_FEATURES, formatMoney, scheduleSentence, type PlanDefinition } from "@rh/shared";
import { client } from "../../../../src/api/session";
import { Said, useRun } from "../../../../src/screens/platform-kit";
import { ask } from "../../../../src/screens/payroll-month";
import { NewPlanForm, PlanEditor } from "../../../../src/screens/plan-editor";
import { Button } from "../../../../src/design/button";
import { Kpi } from "../../../../src/design/charts";
import { Lenses } from "../../../../src/design/lenses";
import { useMoneyFormat } from "../../../../src/design/money";
import { Empty, Loading, Problem } from "../../../../src/design/states";
import { Card } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { color, elevation, radius, space } from "../../../../src/design/tokens";

const SHELVES = ["Resorts", "Agencies"] as const;

export default function PlatformPlans() {
  const qc = useQueryClient();
  const fmt = useMoneyFormat();
  const money = (n: number) => formatMoney(n, { ...fmt, decimals: 0 });
  const plans = useApi<PlanDefinition[]>(keys.platform("plans"), () => client.platform.plans());
  const { run, busy, said } = useRun(() => qc.invalidateQueries({ queryKey: ["platform"] }));
  const [shelf, setShelf] = useState<(typeof SHELVES)[number]>("Resorts");
  const [open, setOpen] = useState<string | null>(null);
  const [making, setMaking] = useState(false);

  const header = <Stack.Screen options={{ title: "Plans" }} />;
  if (plans.error && !plans.data) return (<>{header}<Problem error={plans.error} onRetry={() => void plans.refetch()} /></>);
  if (!plans.data) return (<>{header}<Loading what="the plans" /></>);
  const audienceOf = (s: (typeof SHELVES)[number]) => (s === "Agencies" ? "AGENCY" : "RESORT");
  const shown = plans.data.filter((p) => (p.audience ?? "RESORT") === audienceOf(shelf)).sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <>
      {header}
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={plans.isRefetching} onRefresh={() => void plans.refetch()} />}>
        <Lenses options={SHELVES} value={shelf} onChange={setShelf} countOf={(s) => plans.data!.filter((p) => (p.audience ?? "RESORT") === audienceOf(s)).length} />
        <Said said={said} />
        {shown.length === 0 ? (
          <Card>
            <Empty message="No plans on this shelf" hint="Make one below." />
          </Card>
        ) : null}
        {shown.map((p) => {
          const features = PLAN_FEATURES.filter((f) => f.audience === (p.audience ?? "RESORT"));
          const has = features.filter((f) => p.features.includes(f.key));
          const priced = p.schedules.filter((s) => s.active);
          return (
            <View key={p.name} style={[styles.plan, !p.active && styles.retired]}>
              <View style={[styles.band, { backgroundColor: p.highlight ? color.chart.money.income.solid : p.active ? color.chart.money.paid.solid : color.ink[300] }]} />
              <View style={styles.body}>
                <View style={styles.head}>
                  <View style={styles.flex}>
                    <Text step="title" weight="bold" tone="title" numberOfLines={1}>
                      {p.label || p.name}
                    </Text>
                    <Text step="caption" tone="muted" numberOfLines={1}>
                      {`${p.name}${p.highlight ? " · Most popular" : ""}`}
                    </Text>
                  </View>
                  <View style={[styles.state, { backgroundColor: p.active ? color.chart.money.paid.soft : color.ink[100] }]}>
                    <Text step="caption" weight="bold" style={{ color: p.active ? color.chart.money.paid.solid : color.ink[500] }}>
                      {p.active ? "On sale" : "Retired"}
                    </Text>
                  </View>
                </View>
                {p.blurb ? (
                  <Text step="small" tone="body" numberOfLines={2}>
                    {p.blurb}
                  </Text>
                ) : null}
                {priced.map((s) => (
                  <View key={s.id} style={styles.price}>
                    <Text step="caption" weight="bold" tone="muted" numberOfLines={1}>
                      {s.label.toUpperCase()}
                    </Text>
                    <Text step="small" weight="medium" tone="title" numberOfLines={2}>
                      {scheduleSentence(s.phases, money)}
                    </Text>
                  </View>
                ))}
                <View style={styles.figures}>
                  <Kpi label="Trial" value={`${p.trialDays}d`} tint={color.chart.money.advance.solid} />
                  <Kpi label="Staff" value={String(p.maxStaff)} tint={color.chart.money.income.solid} />
                  {p.audience !== "AGENCY" ? <Kpi label="Rooms" value={String(p.maxRooms)} tint={color.chart.money.paid.solid} /> : null}
                </View>
                {features.length > 0 ? (
                  <View style={styles.gapSm}>
                    <View style={styles.meter}>
                      {features.map((f) => (
                        <View key={f.key} style={[styles.seg, { backgroundColor: p.features.includes(f.key) ? color.chart.money.paid.solid : color.ink[100] }]} />
                      ))}
                    </View>
                    <Text step="caption" tone="muted" numberOfLines={2}>
                      {`${has.length} of ${features.length} tools${has.length ? ` — ${has.map((f) => f.label).join(", ")}` : ""}`}
                    </Text>
                  </View>
                ) : null}
                <Button label={open === p.name ? "Close" : "Edit"} kind="ghost" onPress={() => setOpen(open === p.name ? null : p.name)} />
                {open === p.name ? (
                  <PlanEditor
                    plan={p}
                    busy={busy === p.name}
                    money={money}
                    onSave={(patch) => void run(p.name, () => client.platform.updatePlan(p.name, patch), `${patch.label || p.name} saved`)}
                    onDelete={() =>
                      ask(
                        `Delete the ${p.label || p.name} plan?`,
                        "Retiring it instead keeps its customers and takes it off the pricing page.",
                        "Delete",
                        () => void run(p.name, () => client.platform.deletePlan(p.name), "Plan deleted").then((ok) => ok && setOpen(null)),
                      )
                    }
                  />
                ) : null}
              </View>
            </View>
          );
        })}
        {making ? (
          <Card title="New plan">
            <NewPlanForm
              busy={busy === "new"}
              taken={plans.data.map((p) => p.name)}
              onCancel={() => setMaking(false)}
              onCreate={(body) => void run("new", () => client.platform.createPlan(body), `${body.label} created`).then((ok) => ok && setMaking(false))}
            />
          </Card>
        ) : (
          <Button label="New plan" onPress={() => setMaking(true)} />
        )}
        <Card title="How plan billing works">
          <View style={styles.gapSm}>
            <Text step="small" tone="muted">Assign a plan per resort in Resorts — the trial length comes from the plan.</Text>
            <Text step="small" tone="muted">Bills are raised by the billing sweep from each plan's ways of buying.</Text>
            <Text step="small" tone="muted">A plan with customers cannot be deleted — retire it and they stay on it.</Text>
          </View>
        </Card>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  flex: { flex: 1 },
  gapSm: { gap: space.xs },
  plan: { flexDirection: "row", backgroundColor: color.surface, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: color.ink[100], ...elevation.raised },
  retired: { opacity: 0.75 },
  band: { width: 6 },
  body: { flex: 1, padding: space.lg, gap: space.md },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  state: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.xl },
  price: { padding: space.sm, borderRadius: radius.md, backgroundColor: color.ink[50], gap: 2 },
  figures: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  meter: { flexDirection: "row", gap: 3 },
  seg: { flex: 1, height: 8, borderRadius: 4 },
});
