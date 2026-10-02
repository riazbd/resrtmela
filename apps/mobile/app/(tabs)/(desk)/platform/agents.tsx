/**
 * Travel agencies on the platform — the console's Agents tab on the phone:
 * the queue waiting for verification, suspending one (with the reason it
 * will be shown) and letting it back in, every agent with where it has sold,
 * logging in as one, and its wallet with the platform — the balance, what
 * moved, and moving it.
 */
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, router } from "expo-router";
import { keys, useApi, useQueryClient } from "@rh/app-core";
import { dayLabel, formatMoney, type PlatformAgencyRow, type PlatformAgentRow, type PlatformWallet } from "@rh/shared";
import { client, useAuth } from "../../../../src/api/session";
import { Pill, Said, useRun } from "../../../../src/screens/platform-kit";
import { Button } from "../../../../src/design/button";
import { Chip } from "../../../../src/design/chip";
import { Field, Input } from "../../../../src/design/input";
import { Lenses } from "../../../../src/design/lenses";
import { useMoneyFormat } from "../../../../src/design/money";
import { Empty, Loading } from "../../../../src/design/states";
import { Card, Row } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { color, elevation, radius, space } from "../../../../src/design/tokens";

const WALLET_KIND: Record<string, string> = {
  TOPUP: "Received",
  PAYOUT: "Returned",
  ADJUST: "Correction",
  COMMISSION: "Commission (historic)",
  BOOKING_HOLD: "Booking (historic)",
  REFUND: "Refund (historic)",
};

export default function PlatformAgents() {
  const { impersonate } = useAuth();
  const qc = useQueryClient();
  const fmt = useMoneyFormat();
  const money = (n: number) => formatMoney(n, { ...fmt, decimals: 0 });
  const [view, setView] = useState<"Waiting" | "All agencies">("Waiting");
  const agencies = useApi<PlatformAgencyRow[]>(keys.platform("agencies"), () => client.platform.agencies());
  const agents = useApi<PlatformAgentRow[]>(keys.platform("agents"), () => client.platform.agents());
  const { run, busy, said } = useRun(() => qc.invalidateQueries({ queryKey: ["platform"] }));
  const [reasonFor, setReasonFor] = useState<PlatformAgencyRow | null>(null);
  const [reason, setReason] = useState("abuse");
  const [walletFor, setWalletFor] = useState<PlatformAgentRow | null>(null);

  const header = <Stack.Screen options={{ title: "Agencies" }} />;
  if (!agencies.data && !agents.data) return (<>{header}<Loading what="the agencies" /></>);
  const pending = (agencies.data ?? []).filter((a) => a.status === "pending");
  const others = (agencies.data ?? []).filter((a) => a.status !== "pending");

  async function loginAs(userId: number) {
    const ok = await run(`login${userId}`, async () => {
      const r = await client.platform.loginAs(userId);
      await impersonate(r.accessToken);
    }, "Viewing as them");
    if (ok) router.replace("/agent/discover");
  }

  if (walletFor) return (<>{header}<Wallet agent={walletFor} money={money} onBack={() => { setWalletFor(null); void agents.refetch(); }} /></>);

  return (
    <>
      {header}
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={agencies.isRefetching} onRefresh={() => { void agencies.refetch(); void agents.refetch(); }} />}
      >
        <Lenses options={["Waiting", "All agencies"] as const} value={view} onChange={setView} countOf={(o) => (o === "Waiting" ? pending.length : (agents.data?.length ?? 0))} />
        <Said said={said} />

        {reasonFor ? (
          <Card title={`Suspend ${reasonFor.name}`}>
            <View style={styles.gap}>
              <Field label="Why" hint="Shown to whoever asks later">
                <Input value={reason} onChangeText={setReason} maxLength={32} />
              </Field>
              <Button
                label="Suspend"
                kind="danger"
                onPress={async () => {
                  if (await run(`s${reasonFor.id}`, () => client.platform.setAccountStatus(reasonFor.id, "suspended", reason.slice(0, 32)), `${reasonFor.name} is suspended`)) setReasonFor(null);
                }}
              />
              <Button label="Cancel" kind="ghost" onPress={() => setReasonFor(null)} />
            </View>
          </Card>
        ) : null}

        {view === "Waiting" ? (
          <>
            {pending.length === 0 ? (
              <Card>
                <Empty message="Nobody is waiting" hint="New agencies appear here to be verified." />
              </Card>
            ) : (
              pending.map((a) => <AgencyCard key={a.id} a={a} onVerify={() => void run(`v${a.id}`, () => client.platform.verifyAgency(a.id), `${a.name} is verified — it can sell now`)} busy={busy === `v${a.id}`} />)
            )}
            {others.length > 0 ? (
              <Card title={`Verified or suspended (${others.length})`}>
                {others.map((a, i) => (
                  <Row
                    key={a.id}
                    title={a.name}
                    subtitle={[a.owner?.name, a.status === "suspended" && a.suspendedReason ? `suspended: ${a.suspendedReason}` : null].filter(Boolean).join(" · ") || undefined}
                    last={i === others.length - 1}
                    accessibilityLabel={`${a.name}, ${a.status}`}
                    right={
                      a.status === "suspended" ? (
                        <Button label="Let back in" kind="ghost" block={false} onPress={() => void run(`a${a.id}`, () => client.platform.setAccountStatus(a.id, "active"), `${a.name} is back in`)} />
                      ) : (
                        <Button label="Suspend" kind="subtle" block={false} onPress={() => setReasonFor(a)} />
                      )
                    }
                  />
                ))}
              </Card>
            ) : null}
          </>
        ) : (
          (agents.data ?? []).map((a) => (
            <View key={a.id} style={styles.card}>
              <View style={styles.head}>
                <View style={styles.flex}>
                  <Text step="body" weight="bold" tone="title" numberOfLines={1}>
                    {a.name}
                  </Text>
                  <Text step="caption" tone="muted" numberOfLines={1}>
                    {a.resorts.map((r) => r.name).join(", ") || "Has not sold yet"}
                  </Text>
                </View>
                <Pill value={a.status} />
              </View>
              <Text step="small" tone="body">{`${a.bookings} bookings${a.wallet ? ` · wallet ${money(a.wallet.balance)}` : ""}`}</Text>
              <View style={styles.chips}>
                <Button label="Log in as" kind="ghost" block={false} loading={busy === `login${a.id}`} onPress={() => void loginAs(a.id)} />
                <Button label="Wallet" kind="ghost" block={false} onPress={() => setWalletFor(a)} />
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </>
  );
}

function AgencyCard({ a, onVerify, busy }: { a: PlatformAgencyRow; onVerify: () => void; busy: boolean }) {
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.flex}>
          <Text step="body" weight="bold" tone="title">
            {a.name}
            {a.demo ? "  · demo" : ""}
          </Text>
          <Text step="caption" tone="muted">{`Signed up ${dayLabel(a.createdAt)}`}</Text>
        </View>
        <Pill value={a.status} />
      </View>
      {a.owner ? <Text step="small" tone="body">{[a.owner.name, a.owner.phone, a.owner.email].filter(Boolean).join(" · ")}</Text> : null}
      {a.subscription ? <Text step="small" tone="muted">{`${a.subscription.plan} · ${a.subscription.status.toLowerCase()}`}</Text> : null}
      <Button label="Verify — let it sell" loading={busy} onPress={onVerify} />
    </View>
  );
}

function Wallet({ agent, money, onBack }: { agent: PlatformAgentRow; money: (n: number) => string; onBack: () => void }) {
  const w = useApi<PlatformWallet>(keys.platform("wallet", agent.id), () => client.platform.wallet(agent.id));
  const [kind, setKind] = useState("TOPUP");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const { run, busy, said } = useRun(() => w.refetch());
  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Card title={`Wallet — ${agent.name}`}>
        <Text step="figure" weight="bold" tone={(w.data?.balance ?? 0) < 0 ? "danger" : "ok"} tabular>
          {w.data ? money(w.data.balance) : "…"}
        </Text>
      </Card>
      <Card title="Move money">
        <View style={styles.gap}>
          <View style={styles.chips}>
            <Chip label="Received from the agency" on={kind === "TOPUP"} onPress={() => setKind("TOPUP")} />
            <Chip label="Returned to the agency" on={kind === "PAYOUT"} onPress={() => setKind("PAYOUT")} />
            <Chip label="Correction" on={kind === "ADJUST"} onPress={() => setKind("ADJUST")} />
          </View>
          <Field label={kind === "ADJUST" ? "Amount — negative to take away" : "Amount"}>
            <Input value={amount} onChangeText={setAmount} keyboardType="numbers-and-punctuation" />
          </Field>
          <Field label="Note" hint="Optional">
            <Input value={note} onChangeText={setNote} />
          </Field>
          <Said said={said} />
          <Button
            label={kind === "TOPUP" ? "Add it" : kind === "PAYOUT" ? "Pay it out" : "Adjust"}
            loading={busy === "move"}
            disabled={!(Number(amount) !== 0 && !Number.isNaN(Number(amount)))}
            onPress={async () => {
              if (await run("move", () => client.platform.moveWallet(agent.id, { kind, amount: Number(amount), note: note || undefined }), kind === "TOPUP" ? "Money added" : kind === "PAYOUT" ? "Paid out" : "Adjusted")) {
                setAmount("");
                setNote("");
              }
            }}
          />
        </View>
      </Card>
      <Card title="What moved">
        {!w.data ? (
          <Loading what="the wallet" />
        ) : w.data.txns.length === 0 ? (
          <Empty message="Nothing yet" />
        ) : (
          w.data.txns.map((t, i) => (
            <Row
              key={t.id}
              title={WALLET_KIND[t.kind] ?? t.kind}
              subtitle={[dayLabel(t.createdAt), t.method, t.note].filter(Boolean).join(" · ")}
              last={i === w.data!.txns.length - 1}
              accessibilityLabel={`${WALLET_KIND[t.kind] ?? t.kind}, ${money(t.amount)}`}
              right={
                <Text step="body" weight="bold" tone={t.amount >= 0 ? "ok" : "danger"} tabular>
                  {`${t.amount >= 0 ? "+" : "−"}${money(Math.abs(t.amount))}`}
                </Text>
              }
            />
          ))
        )}
      </Card>
      <Button label="Back to the agencies" kind="ghost" onPress={onBack} />
    </ScrollView>
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
});
