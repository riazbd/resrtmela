/**
 * Offers — signup links with their own plan, trial and discount — the
 * console's Offers tab on the phone: how many used each and signed up, and
 * a new one made and its link shared.
 */
import { useState } from "react";
import { RefreshControl, ScrollView, Share, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { keys, useApi, useQueryClient } from "@rh/app-core";
import { dayLabel, type OfferRow, type PlanDefinition } from "@rh/shared";
import { client } from "../../../../src/api/session";
import { CONSOLE_URL } from "../../../../src/api/config";
import { Said, useRun } from "../../../../src/screens/platform-kit";
import { Button } from "../../../../src/design/button";
import { BarList } from "../../../../src/design/charts";
import { Chip } from "../../../../src/design/chip";
import { Field, Input } from "../../../../src/design/input";
import { Empty, Loading } from "../../../../src/design/states";
import { Card } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { color, elevation, radius, space } from "../../../../src/design/tokens";

const BLANK = { audience: "RESORT" as "RESORT" | "AGENCY", plan: "", trialDays: "", discountPct: "", maxUses: "100", expiresAt: "", email: "", note: "" };
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export default function PlatformOffers() {
  const qc = useQueryClient();
  const offers = useApi<OfferRow[]>(keys.platform("offers"), () => client.platform.offers());
  const plans = useApi<PlanDefinition[]>(keys.platform("plans"), () => client.platform.plans());
  const { run, busy, said } = useRun(() => qc.invalidateQueries({ queryKey: ["platform"] }));
  const [form, setForm] = useState(BLANK);
  const shelf = (plans.data ?? []).filter((p) => (p.audience ?? "RESORT") === form.audience);
  const num = (s: string) => (s.trim() === "" ? undefined : Number(s));
  const link = (o: OfferRow) => `${CONSOLE_URL}/signup${o.audience === "AGENCY" ? "/agency" : ""}?offer=${o.code}`;

  const header = <Stack.Screen options={{ title: "Offers" }} />;
  if (!offers.data) return (<>{header}<Loading what="the offers" /></>);

  return (
    <>
      {header}
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={offers.isRefetching} onRefresh={() => void offers.refetch()} />}>
        <Said said={said} />
        {offers.data.length > 0 ? (
          <Card title="Who came through each">
            <BarList format={(n) => String(n)} barColor={color.chart.money.paid.solid} rows={offers.data.map((o) => ({ label: o.code, sub: o.plan, value: o.signups }))} />
          </Card>
        ) : null}
        {offers.data.length === 0 ? (
          <Card>
            <Empty message="No offers yet" hint="Make one to hand out a signup link with its own plan and trial." />
          </Card>
        ) : (
          offers.data.map((o) => (
            <View key={o.id} style={styles.card}>
              <View style={styles.head}>
                <Text step="strong" weight="bold" tone="title" style={styles.flex} selectable>
                  {o.code}
                </Text>
                <Text step="caption" weight="bold" tone="muted">
                  {o.audience === "AGENCY" ? "Agencies" : "Resorts"}
                </Text>
              </View>
              <Text step="small" tone="body">
                {[o.plan, o.trialDays != null ? `${o.trialDays}-day trial` : null, o.discountPct != null ? `${o.discountPct}% off` : null].filter(Boolean).join(" · ")}
              </Text>
              <Text step="caption" tone="muted">{`${o.uses} of ${o.maxUses} used · ${o.signups} signed up · ${o.expiresAt ? `ends ${dayLabel(o.expiresAt)}` : "never ends"}${o.email ? ` · only ${o.email}` : ""}`}</Text>
              {o.note ? (
                <Text step="caption" tone="muted">
                  {o.note}
                </Text>
              ) : null}
              <Button label="Share the link" kind="ghost" onPress={() => void Share.share({ message: link(o) })} />
            </View>
          ))
        )}
        <Card title="A new offer">
          <View style={styles.gap}>
            <View style={styles.chips}>
              <Chip label="For resorts" on={form.audience === "RESORT"} onPress={() => setForm({ ...form, audience: "RESORT", plan: "" })} />
              <Chip label="For agencies" on={form.audience === "AGENCY"} onPress={() => setForm({ ...form, audience: "AGENCY", plan: "" })} />
            </View>
            <Text step="small" weight="medium" tone="title">
              The plan it lands on
            </Text>
            <View style={styles.chips}>
              {shelf.map((p, i) => (
                <Chip key={p.name} label={p.label} on={(form.plan || shelf[0]?.name) === p.name && (form.plan !== "" || i === 0)} onPress={() => setForm({ ...form, plan: p.name })} />
              ))}
            </View>
            <View style={styles.pair}>
              <View style={styles.flex}>
                <Field label="Trial days">
                  <Input value={form.trialDays} onChangeText={(t) => setForm({ ...form, trialDays: t })} keyboardType="numeric" placeholder="the plan's own" />
                </Field>
              </View>
              <View style={styles.flex}>
                <Field label="Discount %">
                  <Input value={form.discountPct} onChangeText={(t) => setForm({ ...form, discountPct: t })} keyboardType="numeric" placeholder="none" />
                </Field>
              </View>
            </View>
            <View style={styles.pair}>
              <View style={styles.flex}>
                <Field label="Uses">
                  <Input value={form.maxUses} onChangeText={(t) => setForm({ ...form, maxUses: t })} keyboardType="numeric" />
                </Field>
              </View>
              <View style={styles.flex}>
                <Field label="Ends">
                  <Input value={form.expiresAt} onChangeText={(t) => setForm({ ...form, expiresAt: t })} placeholder="2026-12-31" />
                </Field>
              </View>
            </View>
            <Field label="Only for this email" hint="Optional — an invitation">
              <Input value={form.email} onChangeText={(t) => setForm({ ...form, email: t })} keyboardType="email-address" autoCapitalize="none" />
            </Field>
            <Field label="Note" hint="Optional">
              <Input value={form.note} onChangeText={(t) => setForm({ ...form, note: t })} placeholder="Facebook campaign, October" />
            </Field>
            <Button
              label="Make the offer"
              loading={busy === "make"}
              disabled={shelf.length === 0 || (form.expiresAt !== "" && !DAY.test(form.expiresAt))}
              onPress={async () => {
                const ok = await run(
                  "make",
                  () =>
                    client.platform.createOffer({
                      audience: form.audience,
                      plan: form.plan || shelf[0]?.name || "",
                      trialDays: num(form.trialDays),
                      discountPct: num(form.discountPct),
                      maxUses: num(form.maxUses),
                      expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59`).toISOString() : undefined,
                      email: form.email.trim() || undefined,
                      note: form.note.trim() || undefined,
                    }),
                  "Offer made — share its link",
                );
                if (ok) setForm({ ...BLANK, audience: form.audience });
              }}
            />
          </View>
        </Card>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  gap: { gap: space.md },
  pair: { flexDirection: "row", gap: space.sm },
  flex: { flex: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  card: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, gap: 4, borderWidth: 1, borderColor: color.ink[100], ...elevation.raised },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
