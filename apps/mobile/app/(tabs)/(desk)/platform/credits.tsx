/**
 * Email credits — the console's Email credits tab on the phone: the requests
 * waiting for a yes (approved after saying how the money came, or declined
 * with a reason the buyer sees), and the price list resorts and agencies buy
 * from, with the payment instructions shown beside it.
 */
import { useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { keys, useApi, useQueryClient } from "@rh/app-core";
import { dayLabel, formatMoney, type EmailCreditOrderRow } from "@rh/shared";
import { client } from "../../../../src/api/session";
import { HowItArrived, Pill, Said, useRun } from "../../../../src/screens/platform-kit";
import { Button } from "../../../../src/design/button";
import { Field, Input } from "../../../../src/design/input";
import { Lenses } from "../../../../src/design/lenses";
import { useMoneyFormat } from "../../../../src/design/money";
import { Empty, Loading } from "../../../../src/design/states";
import { Card } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { color, elevation, radius, space } from "../../../../src/design/tokens";

export default function PlatformCredits() {
  const qc = useQueryClient();
  const fmt = useMoneyFormat();
  const money = (n: number) => formatMoney(n, { ...fmt, decimals: 0 });
  const orders = useApi<EmailCreditOrderRow[]>(keys.platform("credit-orders"), () => client.platform.creditOrders());
  const settings = useApi<Record<string, string>>(keys.platform("settings"), () => client.platform.settings());
  const { run, busy, said } = useRun(() => qc.invalidateQueries({ queryKey: ["platform"] }));
  const [view, setView] = useState<"Requests" | "Prices">("Requests");
  const [collecting, setCollecting] = useState<{ what: string; pay: (m: string) => void } | null>(null);
  const [declining, setDeclining] = useState<EmailCreditOrderRow | null>(null);
  const [reason, setReason] = useState("");
  const [packs, setPacks] = useState<{ credits: string; price: string }[]>([]);
  const [payTo, setPayTo] = useState("");

  useEffect(() => {
    const v = settings.data;
    if (!v) return;
    try {
      const parsed = JSON.parse(v["email.creditPacks"] ?? "[]") as { credits: number; price: number }[];
      setPacks(parsed.map((p) => ({ credits: String(p.credits), price: String(p.price) })));
    } catch {
      setPacks([]);
    }
    setPayTo(v["platform.paymentInstructions"] ?? "");
  }, [settings.data]);

  const header = <Stack.Screen options={{ title: "Email credits" }} />;
  if (!orders.data) return (<>{header}<Loading what="the requests" /></>);
  const waiting = orders.data.filter((o) => o.status === "PENDING");

  return (
    <>
      {header}
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={orders.isRefetching} onRefresh={() => void orders.refetch()} />}>
        <Lenses options={["Requests", "Prices"] as const} value={view} onChange={setView} countOf={(o) => (o === "Requests" ? waiting.length : packs.length)} />
        <Said said={said} />
        {collecting ? (
          <HowItArrived what={collecting.what} onPick={(m) => { const { pay } = collecting; setCollecting(null); pay(m); }} onCancel={() => setCollecting(null)} />
        ) : null}
        {declining ? (
          <Card title={`Decline ${declining.credits.toLocaleString("en-IN")} credits for ${declining.accountName}`}>
            <View style={styles.gap}>
              <Field label="Why" hint="They will see it">
                <Input value={reason} onChangeText={setReason} />
              </Field>
              <Button
                label="Decline"
                kind="danger"
                onPress={async () => {
                  if (await run(`r${declining.id}`, () => client.platform.decideCreditOrder(declining.id, "REJECT", { note: reason || undefined }), "Declined")) {
                    setDeclining(null);
                    setReason("");
                  }
                }}
              />
              <Button label="Cancel" kind="ghost" onPress={() => setDeclining(null)} />
            </View>
          </Card>
        ) : null}

        {view === "Requests" ? (
          orders.data.length === 0 ? (
            <Card>
              <Empty message="No requests yet" />
            </Card>
          ) : (
            orders.data.map((o) => (
              <View key={o.id} style={styles.card}>
                <View style={styles.head}>
                  <View style={styles.flex}>
                    <Text step="body" weight="bold" tone="title" numberOfLines={1}>
                      {o.accountName}
                    </Text>
                    <Text step="caption" tone="muted" numberOfLines={1}>{`${o.resortName ? `${o.resortName} · ` : ""}${o.buyer} · ${o.buyerContact}`}</Text>
                  </View>
                  <Pill value={o.status} />
                </View>
                <View style={styles.head}>
                  <Text step="small" tone="body" style={styles.flex}>{`${o.credits.toLocaleString("en-IN")} emails · ${dayLabel(o.createdAt)}`}</Text>
                  <Text step="strong" weight="bold" tone="title" tabular>
                    {money(o.price)}
                  </Text>
                </View>
                {o.note ? (
                  <Text step="caption" tone="muted">
                    {o.note}
                  </Text>
                ) : null}
                {o.status === "PENDING" ? (
                  <View style={styles.chips}>
                    <Button
                      label="Approve"
                      block={false}
                      loading={busy === `a${o.id}`}
                      onPress={() =>
                        setCollecting({
                          what: `${o.accountName} · ${o.credits.toLocaleString("en-IN")} credits — ${money(o.price)}`,
                          pay: (m) => void run(`a${o.id}`, () => client.platform.decideCreditOrder(o.id, "APPROVE", { method: m }), "Approved — the credits are theirs"),
                        })
                      }
                    />
                    <Button label="Decline" kind="ghost" block={false} onPress={() => setDeclining(o)} />
                  </View>
                ) : null}
              </View>
            ))
          )
        ) : (
          <Card title="What resorts and agencies buy">
            <View style={styles.gap}>
              <Text step="small" tone="muted">
                Nothing is charged online — a request waits for you to see the money arrive and approve it.
              </Text>
              {packs.map((p, i) => (
                <View key={i} style={styles.pack}>
                  <View style={styles.flex}>
                    <Input value={p.credits} onChangeText={(t) => setPacks(packs.map((x, j) => (i === j ? { ...x, credits: t } : x)))} keyboardType="numeric" accessibilityLabel="Emails" placeholder="Emails" />
                  </View>
                  <View style={styles.flex}>
                    <Input value={p.price} onChangeText={(t) => setPacks(packs.map((x, j) => (i === j ? { ...x, price: t } : x)))} keyboardType="numeric" accessibilityLabel="Price" placeholder="Price" />
                  </View>
                  <Button label="×" kind="subtle" block={false} accessibilityLabel="Remove the pack" onPress={() => setPacks(packs.filter((_, j) => j !== i))} />
                </View>
              ))}
              <Button label="Add a pack" kind="ghost" onPress={() => setPacks([...packs, { credits: "", price: "" }])} />
              <Field label="How to pay" hint="Shown to the buyer beside the packs — a bKash number, a bank account">
                <Input value={payTo} onChangeText={setPayTo} multiline />
              </Field>
              <Button
                label="Save the prices"
                loading={busy === "prices"}
                onPress={() => {
                  const rows = packs.map((p) => ({ credits: Number(p.credits), price: Number(p.price) })).filter((p) => p.credits > 0 && p.price >= 0);
                  void run("prices", () => client.platform.updateSettings({ "email.creditPacks": JSON.stringify(rows), "platform.paymentInstructions": payTo }), "Prices saved");
                }}
                disabled={!packs.some((p) => Number(p.credits) > 0)}
              />
            </View>
          </Card>
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
  pack: { flexDirection: "row", alignItems: "center", gap: space.sm },
  card: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, gap: 4, borderWidth: 1, borderColor: color.ink[100], ...elevation.raised },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
