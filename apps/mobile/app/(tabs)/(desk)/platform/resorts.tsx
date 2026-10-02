/**
 * Every resort on the platform, and what the platform owner does to one —
 * the console's Resorts tab on the phone: start a subscription (plan, term,
 * first fee, trial), renew or cancel it, suspend or let back in, mark the
 * account a demo, and log in as its owner to see what they see.
 */
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, router } from "expo-router";
import { keys, useApi, useQueryClient } from "@rh/app-core";
import { dayLabel, formatMoney, scheduleSentence, type PlanDefinition, type PlatformResortRow } from "@rh/shared";
import { client, useAuth } from "../../../../src/api/session";
import { Pill, Said, useRun } from "../../../../src/screens/platform-kit";
import { Button } from "../../../../src/design/button";
import { Chip } from "../../../../src/design/chip";
import { Field, Input } from "../../../../src/design/input";
import { useMoneyFormat } from "../../../../src/design/money";
import { Empty, Loading, Problem } from "../../../../src/design/states";
import { Card } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { color, elevation, radius, space } from "../../../../src/design/tokens";

export default function PlatformResorts() {
  const { impersonate } = useAuth();
  const qc = useQueryClient();
  const fmt = useMoneyFormat();
  const money = (n: number) => formatMoney(n, { ...fmt, decimals: 0 });
  const resorts = useApi<PlatformResortRow[]>(keys.platform("resorts"), () => client.platform.resorts());
  const plans = useApi<PlanDefinition[]>(keys.platform("plans"), () => client.platform.plans());
  const { run, busy, said } = useRun(() => qc.invalidateQueries({ queryKey: ["platform"] }));
  const [q, setQ] = useState("");
  const [subFor, setSubFor] = useState<PlatformResortRow | null>(null);
  const [plan, setPlan] = useState("");
  const [shelf, setShelf] = useState<number | null>(null);
  const [fee, setFee] = useState("");
  const [trial, setTrial] = useState("");

  const header = <Stack.Screen options={{ title: "Resorts" }} />;
  if (resorts.error && !resorts.data) return (<>{header}<Problem error={resorts.error} onRetry={() => void resorts.refetch()} /></>);
  if (!resorts.data) return (<>{header}<Loading what="the resorts" /></>);

  const rows = resorts.data.filter((r) => !q.trim() || `${r.name} ${r.tenant.name} ${r.location ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  const active = (plans.data ?? []).filter((p) => p.active);

  function startSubscribe(r: PlatformResortRow) {
    const first = active[0];
    const s = first?.schedules.find((x) => x.active) ?? null;
    setSubFor(r);
    setPlan(first?.name ?? "");
    setShelf(s?.id ?? null);
    setFee(s ? String(s.openingFee) : "");
    setTrial(first ? String(first.trialDays) : "0");
  }

  async function loginAs(userId: number) {
    const ok = await run(`login${userId}`, async () => {
      const r = await client.platform.loginAs(userId);
      await impersonate(r.accessToken);
    }, "Viewing as them");
    if (ok) router.replace("/dashboard");
  }

  const chosen = active.find((p) => p.name === plan);
  const shelves = (chosen?.schedules ?? []).filter((x) => x.active);

  return (
    <>
      {header}
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={resorts.isRefetching} onRefresh={() => void resorts.refetch()} />}>
        <Input value={q} onChangeText={setQ} placeholder="Find a resort or an owner" accessibilityLabel="Find a resort" />
        <Said said={said} />

        {subFor ? (
          <Card title={`Subscribe — ${subFor.name}`}>
            <View style={styles.gap}>
              <Text step="small" weight="medium" tone="title">
                Plan
              </Text>
              <View style={styles.chips}>
                {active.map((p) => (
                  <Chip
                    key={p.name}
                    label={p.label}
                    on={plan === p.name}
                    onPress={() => {
                      const s = p.schedules.find((x) => x.active) ?? null;
                      setPlan(p.name);
                      setShelf(s?.id ?? null);
                      setFee(s ? String(s.openingFee) : "");
                      setTrial(String(p.trialDays));
                    }}
                  />
                ))}
              </View>
              {shelves.length === 0 ? (
                <Text step="small" tone="warn">
                  This plan has no price yet — set one under Plans first.
                </Text>
              ) : (
                shelves.map((x) => (
                  <Chip
                    key={x.id}
                    label={`${x.label} — ${scheduleSentence(x.phases, money)}`}
                    on={shelf === x.id}
                    onPress={() => {
                      setShelf(x.id);
                      setFee(String(x.openingFee));
                    }}
                  />
                ))
              )}
              <Field label="First period's fee" hint="Overrides the ladder once">
                <Input value={fee} onChangeText={setFee} keyboardType="numeric" />
              </Field>
              <Field label="Free trial (days)" hint="0 for none">
                <Input value={trial} onChangeText={setTrial} keyboardType="numeric" />
              </Field>
              <Text step="caption" tone="muted">
                {trial.trim() === "" ? "Whatever this plan sells." : Number(trial) > 0 ? `Free for ${trial} days, then ${money(Number(fee) || 0)} for the first period.` : "No free trial — the first period is due today."}
              </Text>
              <Button
                label="Start the subscription"
                loading={busy === "sub"}
                disabled={!plan}
                onPress={async () => {
                  const ok = await run(
                    "sub",
                    () =>
                      client.platform.subscribe(subFor.id, {
                        plan,
                        ...(shelf == null ? {} : { scheduleId: shelf }),
                        fee: Number(fee),
                        ...(trial.trim() === "" ? {} : { trialDays: Number(trial) }),
                      }),
                    `${subFor.name} is on ${chosen?.label ?? plan}`,
                  );
                  if (ok) setSubFor(null);
                }}
              />
              <Button label="Cancel" kind="ghost" onPress={() => setSubFor(null)} />
            </View>
          </Card>
        ) : null}

        {rows.length === 0 ? (
          <Card>
            <Empty message={q ? "No resort by that name" : "No resorts yet"} />
          </Card>
        ) : (
          rows.map((r) => {
            const s = r.tenant.subscriptions[0];
            const owner = r.userResorts?.[0]?.user;
            return (
              <View key={r.id} style={styles.card}>
                <View style={styles.head}>
                  <View style={styles.flex}>
                    <Text step="body" weight="bold" tone="title" numberOfLines={1}>
                      {r.name}
                      {r.tenant.demo ? "  · demo" : ""}
                    </Text>
                    <Text step="caption" tone="muted" numberOfLines={1}>{`${r.location ?? "—"} · ${r.tenant.name}`}</Text>
                  </View>
                  <Pill value={r.status} />
                </View>
                <View style={styles.facts}>
                  <Text step="small" tone="body">{s ? `${s.plan}${s.scheduleLabel ? ` · ${s.scheduleLabel}` : ""}` : "No subscription"}</Text>
                  <Text step="small" tone="muted">{`${r._count.rooms} rooms · ${r._count.bookings} bookings`}</Text>
                  {s?.renewsAt ? <Text step="small" tone="muted">{`Renews ${dayLabel(s.renewsAt)}`}</Text> : null}
                </View>
                <View style={styles.chips}>
                  {owner ? <Button label="Log in as" kind="ghost" block={false} loading={busy === `login${owner.id}`} onPress={() => void loginAs(owner.id)} /> : null}
                  <Button label="Subscribe" kind="ghost" block={false} onPress={() => startSubscribe(r)} />
                  {s ? (
                    <>
                      <Button label="Renew" kind="ghost" block={false} loading={busy === `renew${r.id}`} onPress={() => void run(`renew${r.id}`, () => client.platform.renew(Number(s.id), 1), `${r.name} renewed for one more ${s.scheduleLabel?.toLowerCase() ?? "period"}`)} />
                      <Button label="Cancel" kind="subtle" block={false} loading={busy === `cancel${r.id}`} onPress={() => void run(`cancel${r.id}`, () => client.platform.cancelSubscription(Number(s.id)), `${r.name}'s subscription is cancelled`)} />
                    </>
                  ) : null}
                  <Button
                    label={r.status === "active" ? "Suspend" : "Activate"}
                    kind={r.status === "active" ? "danger" : "ghost"}
                    block={false}
                    loading={busy === `status${r.id}`}
                    onPress={() => void run(`status${r.id}`, () => client.platform.setResortStatus(r.id, r.status === "active" ? "suspended" : "active"), r.status === "active" ? `${r.name} is suspended` : `${r.name} is active`)}
                  />
                  <Button
                    label={r.tenant.demo ? "Not demo" : "Mark demo"}
                    kind="subtle"
                    block={false}
                    onPress={() => void run(`demo${r.id}`, () => client.platform.setAccountDemo(r.tenant.id, !r.tenant.demo), r.tenant.demo ? "Counted again" : "Marked as demo")}
                  />
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  gap: { gap: space.md },
  flex: { flex: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.sm,
    borderWidth: 1,
    borderColor: color.ink[100],
    ...elevation.raised,
  },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  facts: { gap: 2 },
});
