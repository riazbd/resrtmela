/**
 * What this agency owes each resort, and what each resort owes it — on a phone.
 *
 * **Not the Wallet.** That is money deposited with the *platform* for
 * subscriptions and email credits. This is the trade account with a supplier,
 * the figure an agency rings a resort about at the end of the month. Two
 * different pockets, and one screen showing both would be worse than neither.
 *
 * The figures come from the resort's own ledger through the same fold the
 * resort's console renders, so an agent looking at this and an owner looking at
 * theirs are reading one document. The only thing an agency may write is a
 * declaration — *"I sent 9,000 by bKash, TrxID is this"* — which stays outside
 * the balance until the resort has matched it against the money. An agency able
 * to confirm its own remittances could reduce what it owes by typing, and then
 * a statement is not a statement.
 *
 * **A declaration says what the money was for** (2026-10-01): handed over
 * against stays sold, or put down in advance of them. Every one was a
 * remittance before, so a float for the season read on both statements as
 * money for stays that did not exist yet. And an advance can open the account —
 * "Deposit an advance" offers the resorts open to the agency as well as the
 * ones it has sold, because the deposit is often the first thing paid.
 */
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { keys, useApi } from "@rh/app-core";
import {
  agentBalanceSays,
  agentEntryLabel,
  dayLabel,
  formatMoney,
  todayIn,
  type AgentDeclareKind,
  type AgentStatement,
  type DiscoverResort,
  type MyAccountList,
} from "@rh/shared";
import { client, useAuth } from "../../../../src/api/session";
import { Button } from "../../../../src/design/button";
import { Chip } from "../../../../src/design/chip";
import { Field, Input } from "../../../../src/design/input";
import { useMoneyFormat } from "../../../../src/design/money";
import { Empty, Loading, Problem, Stale } from "../../../../src/design/states";
import { Card, Row, Stat } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { useAction } from "../../../../src/design/use-action";
import { color, space } from "../../../../src/design/tokens";

export default function MyAccountsScreen() {
  const { can } = useAuth();
  const money = useMoneyFormat();
  const whole = (amount: number) => formatMoney(amount, { ...money, decimals: 0 });
  /** The resort whose statement is open, and whether it opened on the form. */
  const [open, setOpen] = useState<{ resortId: number; declare?: AgentDeclareKind } | null>(null);
  const [choosing, setChoosing] = useState(false);

  const list = useApi<MyAccountList>(keys.myAccounts(), () => client.agent.accounts.list(), {
    enabled: can("agent.account.view"),
    placeholderData: (prev: MyAccountList | undefined) => prev,
  });

  const header = <Stack.Screen options={{ title: "Resort accounts" }} />;

  if (!can("agent.account.view")) {
    return (
      <>
        {header}
        <View style={styles.middle}>
          <Empty message="Not open to you" hint="Ask the agency owner for access to the accounts." />
        </View>
      </>
    );
  }
  if (list.error && !list.data) {
    return (
      <>
        {header}
        <Problem error={list.error} onRetry={() => void list.refetch()} />
      </>
    );
  }
  if (!list.data) {
    return (
      <>
        {header}
        <Loading what="your resort accounts" />
      </>
    );
  }

  const d = list.data;

  if (open) {
    return (
      <>
        {header}
        <MyStatement
          resortId={open.resortId}
          startDeclaring={open.declare}
          mayRemit={can("agent.remit")}
          onBack={() => {
            setOpen(null);
            void list.refetch();
          }}
        />
      </>
    );
  }

  if (choosing) {
    return (
      <>
        {header}
        <ChooseResort
          known={d.rows.map((r) => ({ id: r.resort.id, name: r.resort.name }))}
          onChoose={(resortId) => {
            setChoosing(false);
            setOpen({ resortId, declare: "ADVANCE" });
          }}
          onClose={() => setChoosing(false)}
        />
      </>
    );
  }

  return (
    <>
      {header}
      <Stale age={list.stale} />
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={
          <RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />
        }
      >
        <View style={styles.figures}>
          <Stat label="Due from you" value={whole(d.owedByMe)} tone="danger" />
          <Stat label="Due to you" value={whole(d.owedToMe)} tone="ok" />
        </View>
        {d.pending > 0 ? (
          <Stat
            label="Waiting to be confirmed"
            value={whole(d.pending)}
            sub="You have told the resort. It counts once they match it."
          />
        ) : null}

        {can("agent.remit") ? (
          <Button label="Deposit an advance" kind="ghost" onPress={() => setChoosing(true)} />
        ) : null}

        <Card title={`${d.rows.length} ${d.rows.length === 1 ? "resort" : "resorts"}`}>
          {d.rows.length === 0 ? (
            <View style={styles.emptyBox}>
              <Empty
                message="No account with any resort yet"
                hint="One opens as soon as you sell a room."
              />
            </View>
          ) : (
            d.rows.map((r, i) => (
              <Row
                key={r.resort.id}
                title={r.resort.name}
                subtitle={agentBalanceSays(r.balance, "you")}
                meta={[
                  `${r.bookings} ${r.bookings === 1 ? "booking" : "bookings"}`,
                  `${whole(r.commission)} earned`,
                  r.pending > 0 ? `${whole(r.pending)} waiting` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                last={i === d.rows.length - 1}
                onPress={() => setOpen({ resortId: r.resort.id })}
                accessibilityLabel={`${r.resort.name}, ${agentBalanceSays(r.balance, "you")}, ${whole(Math.abs(r.balance))}`}
                right={
                  <Text
                    step="body"
                    weight="medium"
                    tone={r.balance > 0 ? "danger" : r.balance < 0 ? "ok" : "muted"}
                    tabular
                  >
                    {whole(Math.abs(r.balance))}
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

/**
 * Which resort an advance goes to.
 *
 * The ones the agency already has an account with, and the ones open to it —
 * once each, because a resort it sells is in both lists.
 */
function ChooseResort({
  known,
  onChoose,
  onClose,
}: {
  known: { id: number; name: string }[];
  onChoose: (resortId: number) => void;
  onClose: () => void;
}) {
  const open = useApi<DiscoverResort[]>(["agent-discover"], () => client.agent.discover());
  const choices = [
    ...new Map(
      [...known, ...(open.data ?? []).filter((r) => r.access === "OPEN")].map((r) => [r.id, r.name]),
    ),
  ];

  return (
    <ScrollView contentContainerStyle={styles.sheetBody}>
      <Text step="strong" tone="title" weight="medium">
        Deposit an advance with
      </Text>
      <Text step="small" tone="muted">
        Money put down ahead of the stays it will pay for. The resort confirms it once the money
        has arrived, and it is set against what is due from you.
      </Text>
      {open.isLoading && known.length === 0 ? <Loading what="the resorts open to you" /> : null}
      <View style={styles.chips}>
        {choices.map(([id, name]) => (
          <Chip key={id} label={name} on={false} onPress={() => onChoose(id)} />
        ))}
      </View>
      {!open.isLoading && choices.length === 0 ? (
        <Empty message="No resort is open to you yet" />
      ) : null}
      <Button label="Not now" kind="ghost" onPress={onClose} />
    </ScrollView>
  );
}

function MyStatement({
  resortId,
  startDeclaring,
  mayRemit,
  onBack,
}: {
  resortId: number;
  /** opened from "Deposit an advance": straight to the form, on that kind */
  startDeclaring?: AgentDeclareKind;
  mayRemit: boolean;
  onBack: () => void;
}) {
  const money = useMoneyFormat();
  const whole = (amount: number) => formatMoney(amount, { ...money, decimals: 0 });
  const [declaring, setDeclaring] = useState<AgentDeclareKind | null>(
    mayRemit ? (startDeclaring ?? null) : null,
  );

  const s = useApi<AgentStatement>(keys.myStatement(resortId), () =>
    client.agent.accounts.statement(resortId),
  );

  /**
   * Per row, so not a `useAction` — that hook wraps a call taking no arguments.
   * A busy id rather than a busy flag keeps the rest of the statement live.
   */
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const withdraw = async (entryId: string) => {
    setWithdrawing(entryId);
    try {
      await client.agent.accounts.withdraw(entryId);
      await s.refetch();
    } finally {
      setWithdrawing(null);
    }
  };

  if (s.error && !s.data) return <Problem error={s.error} onRetry={() => void s.refetch()} />;
  if (!s.data) return <Loading what="your statement" />;

  const d = s.data;

  if (declaring) {
    return (
      <Declare
        statement={d}
        initialKind={declaring}
        onClose={() => setDeclaring(null)}
        onSaved={() => {
          setDeclaring(null);
          void s.refetch();
        }}
      />
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      refreshControl={<RefreshControl refreshing={s.isRefetching} onRefresh={() => void s.refetch()} />}
    >
      <Stat
        label={d.resort.name}
        value={whole(Math.abs(d.balance))}
        tone={d.balance > 0 ? "danger" : d.balance < 0 ? "ok" : "title"}
        sub={agentBalanceSays(d.balance, "you")}
      />
      {d.pending > 0 ? (
        <Text step="small" tone="muted">
          {whole(d.pending)} told to the resort and not yet confirmed — outside the figure above.
        </Text>
      ) : null}
      {d.creditLimit != null ? (
        <Text step="small" tone={d.overLimit ? "danger" : "muted"}>
          Credit limit {whole(d.creditLimit)}
          {d.overLimit ? " — reached. Settle up before booking again." : ""}
        </Text>
      ) : null}

      <View style={styles.figures}>
        <Stat label="Took from guests" value={whole(d.collected)} />
        <Stat label="Handed over" value={whole(d.remitted)} />
      </View>
      <View style={styles.figures}>
        <Stat label="Commission earned" value={whole(d.commission)} />
        <Stat label="Commission received" value={whole(d.commissionPaid)} />
      </View>
      {/* put down ahead of the stays — already inside the figure at the top */}
      <Stat label="Advances" value={whole(d.advances)} />

      <Text step="small" tone="muted">
        Your terms here:{" "}
        {d.terms.kind === "FLAT" ? `${whole(d.terms.rate)} per booking` : `${d.terms.rate}% of rent`}
      </Text>

      {mayRemit ? <Button label="I have sent money" onPress={() => setDeclaring("REMIT")} /> : null}

      <Card title="Every line">
        {d.rows.length === 0 ? (
          <View style={styles.emptyBox}>
            <Empty message="Nothing on this account yet" hint="It fills as money moves." />
          </View>
        ) : (
          d.rows.map((r, i) => (
            <Row
              key={r.id}
              title={agentEntryLabel(r.kind)}
              subtitle={[dayLabel(r.date), r.booking?.code, r.methodLabel].filter(Boolean).join(" · ")}
              meta={[r.trxId, r.note, r.status === "PENDING" ? "waiting for the resort" : null]
                .filter(Boolean)
                .join(" · ")}
              last={i === d.rows.length - 1}
              onPress={
                mayRemit && r.status === "PENDING" && withdrawing !== r.id
                  ? () => void withdraw(r.id)
                  : undefined
              }
              accessibilityLabel={`${agentEntryLabel(r.kind)}, ${whole(Math.abs(r.amount))}, ${dayLabel(r.date)}${
                r.status === "PENDING" ? ", waiting, tap to withdraw" : ""
              }`}
              right={
                <Text step="body" weight="medium" tone={r.amount > 0 ? "danger" : "ok"} tabular>
                  {whole(Math.abs(r.amount))}
                </Text>
              }
            />
          ))
        )}
      </Card>

      <Button label="Back to the list" kind="ghost" onPress={onBack} />
    </ScrollView>
  );
}

/** The two things an agency may say it sent, as it says them. */
const DECLARE_CHOICES: { kind: AgentDeclareKind; label: string; says: string }[] = [
  { kind: "REMIT", label: "For stays sold", says: "Guest money you are handing over, or settling up." },
  { kind: "ADVANCE", label: "An advance", says: "Put down ahead of the stays it will pay for." },
];

/** "I sent it, here is the TrxID." Pending until the resort matches it. */
function Declare({
  statement,
  initialKind,
  onClose,
  onSaved,
}: {
  statement: AgentStatement;
  initialKind: AgentDeclareKind;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<AgentDeclareKind>(initialKind);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState(statement.methods[0]?.code ?? "");
  const [trxId, setTrxId] = useState("");
  const [note, setNote] = useState("");
  const [refused, setRefused] = useState<string | null>(null);

  const save = useAction(async () => {
    setRefused(null);
    const value = Number(amount);
    if (!(value > 0)) {
      setRefused("Put in how much you sent.");
      return;
    }
    try {
      await client.agent.accounts.declare(statement.resort.id, {
        kind,
        amount: value,
        method,
        trxId: trxId.trim() || undefined,
        // the resort's today, not the phone's — see the note on the console form
        date: todayIn(statement.resort.timezone),
        note: note.trim() || undefined,
      });
      onSaved();
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That did not go through.");
    }
  });

  return (
    <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
      <Text step="strong" tone="title" weight="medium">
        Money sent to {statement.resort.name}
      </Text>
      <Text step="small" tone="muted">
        Recorded straight away and shown to the resort. It changes your balance once they have
        matched it against the money.
      </Text>

      <Field label="What it is" hint={DECLARE_CHOICES.find((c) => c.kind === kind)?.says}>
        <View style={styles.chips}>
          {DECLARE_CHOICES.map((c) => (
            <Chip key={c.kind} label={c.label} on={kind === c.kind} onPress={() => setKind(c.kind)} />
          ))}
        </View>
      </Field>

      <Field label="How much">
        <Input
          value={amount}
          onChangeText={setAmount}
          keyboardType="number-pad"
          placeholder="0"
          accessibilityLabel="How much"
        />
      </Field>

      <Field label="How you sent it">
        <View style={styles.chips}>
          {statement.methods.map((m) => (
            <Chip key={m.code} label={m.label} on={method === m.code} onPress={() => setMethod(m.code)} />
          ))}
        </View>
      </Field>

      <Field label="Transaction id" hint="The bKash, Nagad or bank reference">
        <Input
          value={trxId}
          onChangeText={setTrxId}
          placeholder="Optional, but it ends arguments"
          accessibilityLabel="Transaction id"
        />
      </Field>

      <Field label="Note" hint="Optional">
        <Input value={note} onChangeText={setNote} placeholder="What it covers" accessibilityLabel="Note" />
      </Field>

      {refused ? (
        <Text step="small" tone="danger" weight="medium">
          {refused}
        </Text>
      ) : null}

      <Button label="Tell the resort" loading={save.busy} onPress={save.go} />
      <Button label="Not now" kind="ghost" onPress={onClose} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  middle: { flex: 1, justifyContent: "center", padding: space.lg },
  figures: { flexDirection: "row", gap: space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  emptyBox: { paddingVertical: space.lg },
  sheetBody: { padding: space.lg, gap: space.md, backgroundColor: color.screen },
});
