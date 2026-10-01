/**
 * The subscription, from the side of the person paying for it — on the phone,
 * as on the console's "Subscription" tab.
 *
 * What the resort pays, when it renews, how much of the plan is used, what it
 * would cost to move up or down, and every bill. Moving says what it costs and
 * when it lands before it is pressed, because a button that takes money must
 * say how much.
 */
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { useApi, useQueryClient } from "@rh/app-core";
import { formatMoney, scheduleSentence, type SubscriptionDetail, type SubscriptionPlanOption } from "@rh/shared";
import { client, useAuth } from "../../../../src/api/session";
import { WhichResort } from "../../../../src/screens/which-resort";
import { ask, refusal } from "../../../../src/screens/payroll-month";
import { Button } from "../../../../src/design/button";
import { Kpi, SplitBar } from "../../../../src/design/charts";
import { useMoneyFormat } from "../../../../src/design/money";
import { Empty, Loading, Problem } from "../../../../src/design/states";
import { Card } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { color, elevation, radius, space } from "../../../../src/design/tokens";

const STATUS_LABEL: Record<string, string> = { TRIAL: "Free trial", ACTIVE: "Active", PAST_DUE: "Past due", NONE: "None" };
const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default function SubscriptionScreen() {
  const { activeResort, can } = useAuth();
  const rid = activeResort?.id;
  const qc = useQueryClient();
  const fmt = useMoneyFormat();
  const money = (n: number) => formatMoney(n, { ...fmt, decimals: 0 });
  const [busy, setBusy] = useState("");
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);

  const q = useApi<SubscriptionDetail>(["subscription", rid], () => client.resort.subscription(rid!), {
    enabled: rid !== undefined && can("billing.view"),
  });

  const header = <Stack.Screen options={{ title: "Subscription" }} />;
  if (rid === undefined) return (<>{header}<WhichResort /></>);
  if (!can("billing.view")) return (<>{header}<Empty message="Only the people who handle the bill can see it" /></>);
  if (q.error && !q.data) return (<>{header}<Problem error={q.error} onRetry={() => void q.refetch()} /></>);
  if (!q.data) return (<>{header}<Loading what="the subscription" /></>);
  const d = q.data;

  async function go(key: string, plan: string, scheduleId: number) {
    setBusy(key);
    setSaid(null);
    try {
      const r = await client.resort.changePlan(rid!, plan, scheduleId);
      setSaid({
        ok: true,
        text:
          r.effective === "now"
            ? r.charged > 0
              ? `On ${r.planLabel} — ${money(r.charged)} billed for the rest of this term`
              : `On ${r.planLabel}`
            : r.effective === "cancelled"
              ? `Staying on ${r.planLabel}`
              : `${r.planLabel} starts ${when(r.effectiveFrom)}`,
      });
      await qc.invalidateQueries({ queryKey: ["subscription", rid] });
    } catch (e) {
      setSaid({ ok: false, text: refusal(e) });
    } finally {
      setBusy("");
    }
  }

  function change(p: SubscriptionPlanOption) {
    const target = p.schedules.find((x) => x.label === d.scheduleLabel) ?? p.schedules[0];
    if (!target) {
      setSaid({ ok: false, text: `${p.label} has no price set yet.` });
      return;
    }
    const fee = scheduleSentence(target.phases, money);
    const message = !d.plan
      ? `It begins as a free trial — nothing is billed until the trial ends.`
      : p.direction === "upgrade"
        ? `It applies now, and you are billed only the difference for the days left in this term.`
        : p.direction === "current"
          ? `The change you asked for is called off.`
          : `You keep ${d.planLabel ?? "your plan"} until ${when(d.renewsAt)} — that term is paid for — and ${p.label} starts from then.`;
    const title = !d.plan ? `Start on ${p.label} — ${fee}?` : p.direction === "current" ? `Stay on ${p.label}?` : `${p.direction === "upgrade" ? "Move up" : "Move down"} to ${p.label} — ${fee}?`;
    ask(title, message, p.direction === "current" ? "Stay" : "Yes, move", () => void go(p.name, p.name, target.id));
  }

  const here = d.plans.find((p) => p.name === d.plan);
  const otherCycles = d.pendingScheduleId ? [] : (here?.schedules ?? []).filter((x) => x.id !== d.scheduleId);

  return (
    <>
      {header}
      <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
        {d.outstanding.count > 0 ? (
          <View style={styles.warn}>
            <Text step="small" weight="medium" tone="warn">
              {`${money(d.outstanding.amount)} outstanding across ${d.outstanding.count} bill${d.outstanding.count === 1 ? "" : "s"}. Unpaid bills eventually suspend the resort — you are warned first.`}
            </Text>
          </View>
        ) : null}
        {said ? (
          <Text step="small" weight="medium" tone={said.ok ? "ok" : "danger"}>
            {said.text}
          </Text>
        ) : null}

        {d.plan ? (
          <>
            <View style={styles.figures}>
              <Kpi label="Plan" value={d.planLabel ?? d.plan} tint={color.brand[600]} sub={STATUS_LABEL[d.status] ?? d.status} />
              <Kpi
                label={d.scheduleLabel ?? "Billing"}
                value={money(d.fee)}
                tint={color.chart.money.advance.solid}
                sub={Math.abs(d.feePerMonth - d.fee) > 0.01 ? `${money(d.feePerMonth)} a month` : undefined}
              />
              <Kpi label={d.status === "TRIAL" ? "Trial ends" : "Renews"} value={when(d.status === "TRIAL" ? d.trialEndsAt : d.renewsAt)} tint={color.chart.money.left.solid} />
            </View>
            <Card title="How much of the plan is used">
              <View style={styles.fields}>
                {/* the console's rule: a thousand rooms or more is no limit at all */}
                <Text step="small" tone="body">{d.limits.maxRooms >= 1000 ? `Rooms — ${d.usage.rooms}, no limit` : `Rooms — ${d.usage.rooms} of ${d.limits.maxRooms}`}</Text>
                {d.limits.maxRooms < 1000 ? (
                  <SplitBar legend={false} total={d.limits.maxRooms} parts={[{ label: "Rooms", value: d.usage.rooms, color: color.chart.money.paid.solid }]} />
                ) : null}
                <Text step="small" tone="body">{`Resorts — ${d.usage.resorts} of ${d.limits.maxResorts}`}</Text>
                <SplitBar legend={false} total={d.limits.maxResorts} parts={[{ label: "Resorts", value: d.usage.resorts, color: color.chart.money.advance.solid }]} />
              </View>
            </Card>
            {d.pendingPlan ? (
              <Text step="small" tone="muted">{`Moving to ${d.pendingPlanLabel} on ${when(d.renewsAt)}. Choose ${d.planLabel} again to stay.`}</Text>
            ) : null}
            {d.pendingScheduleId ? (
              <Text step="small" tone="muted">{`Switching to ${d.pendingScheduleLabel} billing on ${when(d.renewsAt)}.`}</Text>
            ) : null}
            {otherCycles.map((x) => (
              <Card key={x.id} title={`Pay ${x.label.toLowerCase()}`}>
                <Text step="small" tone="muted">
                  {scheduleSentence(x.phases, money)}
                </Text>
                <Button
                  label={`Switch to ${x.label.toLowerCase()}`}
                  kind="ghost"
                  loading={busy === `cycle${x.id}`}
                  onPress={() => ask(`Move to ${x.label} billing?`, scheduleSentence(x.phases, money), "Switch", () => void go(`cycle${x.id}`, d.plan!, x.id))}
                />
              </Card>
            ))}
          </>
        ) : (
          <Card title="No subscription yet">
            <Text step="small" tone="muted">
              Pick a plan below to start. It begins as a free trial — nothing is billed until the trial ends.
            </Text>
          </Card>
        )}

        <Text step="title" weight="bold" tone="title">
          Plans
        </Text>
        {d.plans.map((p) => {
          const shelf = p.schedules.find((x) => x.label === d.scheduleLabel) ?? p.schedules[0];
          const current = p.direction === "current";
          return (
            <View key={p.name} style={[styles.plan, current ? styles.planOn : null]}>
              <View style={styles.planHead}>
                <Text step="strong" weight="bold" tone={current ? "onBrand" : "title"}>
                  {p.label}
                </Text>
                {current ? (
                  <View style={styles.currentPill}>
                    <Text step="caption" weight="bold" tone="ok">
                      Current
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text step="figure" weight="bold" tone={current ? "onBrand" : "title"} tabular>
                {shelf ? `${money(shelf.perMonth)}` : "—"}
                <Text step="small" tone={current ? "onBrand" : "muted"}>
                  {shelf ? " /month" : ""}
                </Text>
              </Text>
              <Text step="small" tone={current ? "onBrand" : "muted"}>
                {`${p.maxRooms >= 1000 ? "Unlimited rooms" : `${p.maxRooms} rooms`} · ${p.maxResorts} resort${p.maxResorts === 1 ? "" : "s"}`}
              </Text>
              {p.blurb ? (
                <Text step="caption" tone={current ? "onBrand" : "muted"}>
                  {p.blurb}
                </Text>
              ) : null}
              {!d.plan ? (
                <Button label={`Start on ${p.label}`} loading={busy === p.name} onPress={() => change(p)} />
              ) : !current ? (
                <Button label={p.direction === "upgrade" ? "Move up" : "Move down"} kind={p.direction === "upgrade" ? "primary" : "ghost"} loading={busy === p.name} onPress={() => change(p)} />
              ) : d.pendingPlan ? (
                <Button label={`Stay on ${p.label}`} kind="ghost" loading={busy === p.name} onPress={() => change(p)} />
              ) : null}
            </View>
          );
        })}

        <Card title="Bills">
          {d.bills.length === 0 ? (
            <Empty message="No bills yet" />
          ) : (
            d.bills.map((b) => {
              const paid = b.status === "PAID";
              const late = b.status === "OVERDUE";
              return (
                <View key={b.id} style={styles.bill}>
                  <View style={[styles.dot, { backgroundColor: paid ? color.chart.money.paid.solid : late ? color.chart.money.late.solid : color.chart.money.left.solid }]} />
                  <View style={styles.flex}>
                    <Text step="small" weight="medium" tone="title">{`${when(b.periodStart)} → ${when(b.periodEnd)}`}</Text>
                    <Text step="caption" tone="muted">
                      {paid ? `Paid ${when(b.paidAt)}` : `${b.status.toLowerCase()} · due ${when(b.dueDate)}`}
                      {b.note ? ` · ${b.note}` : ""}
                    </Text>
                  </View>
                  <Text step="body" weight="bold" tone={paid ? "ok" : late ? "danger" : "title"} tabular>
                    {money(b.amount)}
                  </Text>
                </View>
              );
            })
          )}
        </Card>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  fields: { gap: space.sm },
  figures: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  flex: { flex: 1 },
  warn: { backgroundColor: color.warn.bg, borderColor: color.warn.line, borderWidth: 1, borderRadius: radius.md, padding: space.md },
  plan: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.xs,
    borderWidth: 1,
    borderColor: color.ink[100],
    ...elevation.raised,
  },
  planOn: { backgroundColor: color.art.heroFrom, borderColor: color.art.heroFrom },
  planHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  currentPill: { backgroundColor: color.ok.bg, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2 },
  bill: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: color.line },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
