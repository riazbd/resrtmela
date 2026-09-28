/**
 * What each agent owes, and what the resort owes each of them — on a phone.
 *
 * This is not the Dues screen. Dues says an agency's *bookings* are short,
 * which may be money still in a guest's pocket. This says whether the agency is
 * holding the resort's money, is owed commission, or is square — a settlement
 * between two businesses rather than a question for a departing guest.
 *
 * The screen exists on a phone because the event it records happens on one: an
 * agent rings, says *"boro vai, ami amar commission raikha apnare baki ta die
 * ditesi"*, and the money lands. Two boxes — what came in, what they kept — and
 * the booking, the remittance and the commission are all written together.
 *
 * **Nothing is computed here.** `agentBalance` folds the account in
 * `@rh/shared`, which the API and the agency's own screen also use, so the two
 * sides of a settlement cannot arrive at a meeting with different figures.
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
  type AgentAccountList,
  type AgentAccountSummary,
  type AgentStatement,
} from "@rh/shared";
import { client, useAuth } from "../../../src/api/session";
import { WhichResort } from "../../../src/screens/which-resort";
import { Button } from "../../../src/design/button";
import { Chip } from "../../../src/design/chip";
import { Field, Input } from "../../../src/design/input";
import { useMoneyFormat } from "../../../src/design/money";
import { Empty, Loading, Problem, Stale } from "../../../src/design/states";
import { Card, Row, Stat } from "../../../src/design/surface";
import { Text } from "../../../src/design/text";
import { useAction } from "../../../src/design/use-action";
import { color, space } from "../../../src/design/tokens";

export default function AgentAccountsScreen() {
  const { activeResort, can } = useAuth();
  const resortId = activeResort?.id;
  const money = useMoneyFormat();
  const whole = (amount: number) => formatMoney(amount, { ...money, decimals: 0 });

  const [open, setOpen] = useState<AgentAccountSummary | null>(null);

  const list = useApi<AgentAccountList>(
    keys.agentAccounts(resortId),
    () => client.agentAccounts.list(resortId!),
    {
      enabled: Boolean(resortId) && can("settlement.view"),
      placeholderData: (prev: AgentAccountList | undefined) => prev,
    },
  );

  const header = <Stack.Screen options={{ title: "Agent accounts" }} />;

  if (!can("settlement.view")) {
    return (
      <>
        {header}
        <View style={styles.middle}>
          <Empty
            message="Not open to you"
            hint="An agency's trade account is between the owner and the agency. Ask them for access."
          />
        </View>
      </>
    );
  }
  if (!resortId) {
    return (
      <>
        {header}
        <WhichResort />
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
        <Loading what="the agent accounts" />
      </>
    );
  }

  const d = list.data;

  if (open) {
    return (
      <>
        {header}
        <Statement
          resortId={resortId}
          summary={open}
          timezone={activeResort?.timezone}
          resortName={activeResort?.name ?? "the resort"}
          mayManage={can("settlement.manage")}
          onBack={() => {
            setOpen(null);
            void list.refetch();
          }}
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
        {/*
          Two rows rather than four across. These are settlement figures —
          six and seven digits — where a 412-point phone gives a tile in a
          row of four about 88 points.
        */}
        <View style={styles.figures}>
          <Stat label="Due from agents" value={whole(d.owedToResort)} tone="danger" />
          <Stat label="Due to agents" value={whole(d.owedToAgents)} tone="ok" />
        </View>
        {d.pending > 0 ? (
          <Stat
            label="Declared, not confirmed"
            value={whole(d.pending)}
            sub="An agent says they have sent this. Open the account to match it."
          />
        ) : null}

        <Card title={`${d.rows.length} ${d.rows.length === 1 ? "agent" : "agents"}`}>
          {d.rows.length === 0 ? (
            <View style={styles.emptyBox}>
              <Empty message="No agent has sold a room here yet" hint="Accounts appear as they do." />
            </View>
          ) : (
            d.rows.map((r, i) => (
              <Row
                key={r.agencyId}
                title={r.name}
                subtitle={agentBalanceSays(r.balance, r.name)}
                meta={[
                  `${r.bookings} ${r.bookings === 1 ? "booking" : "bookings"}`,
                  r.overLimit ? "over limit" : null,
                  r.pending > 0 ? `${whole(r.pending)} to confirm` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                last={i === d.rows.length - 1}
                onPress={() => setOpen(r)}
                accessibilityLabel={`${r.name}, ${agentBalanceSays(r.balance, r.name)}, ${whole(Math.abs(r.balance))}`}
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

/** One account in full, and the form that writes to it. */
function Statement({
  resortId,
  summary,
  timezone,
  resortName,
  mayManage,
  onBack,
}: {
  resortId: number;
  summary: AgentAccountSummary;
  timezone: string | undefined;
  resortName: string;
  mayManage: boolean;
  onBack: () => void;
}) {
  const money = useMoneyFormat();
  const whole = (amount: number) => formatMoney(amount, { ...money, decimals: 0 });
  const [writing, setWriting] = useState(false);

  const s = useApi<AgentStatement>(
    keys.agentStatement(resortId, summary.agencyId),
    () => client.agentAccounts.statement(resortId, summary.agencyId),
  );

  /**
   * Confirming is per row, so it cannot be a `useAction` — that hook wraps a
   * call with no arguments. A busy id rather than a busy flag, so pressing one
   * line does not grey out the rest of the statement.
   */
  const [confirming, setConfirming] = useState<string | null>(null);
  const confirm = async (entryId: string) => {
    setConfirming(entryId);
    try {
      await client.agentAccounts.confirm(resortId, entryId);
      await s.refetch();
    } finally {
      setConfirming(null);
    }
  };

  if (s.error && !s.data) return <Problem error={s.error} onRetry={() => void s.refetch()} />;
  if (!s.data) return <Loading what="the statement" />;

  const d = s.data;

  if (writing) {
    return (
      <Received
        statement={d}
        resortId={resortId}
        agencyId={summary.agencyId}
        timezone={timezone}
        onClose={() => setWriting(false)}
        onSaved={() => {
          setWriting(false);
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
      {/* the figure, and the sentence saying which way it points — a signed
          number on its own is a question, not an answer */}
      <Stat
        label={d.agency.name}
        value={whole(Math.abs(d.balance))}
        tone={d.balance > 0 ? "danger" : d.balance < 0 ? "ok" : "title"}
        sub={agentBalanceSays(d.balance, d.agency.name)}
      />
      {d.pending > 0 ? (
        <Text step="small" tone="muted">
          {whole(d.pending)} declared and not yet confirmed — outside the figure above.
        </Text>
      ) : null}

      <View style={styles.figures}>
        <Stat label="Took from guests" value={whole(d.collected)} />
        <Stat label="Handed over" value={whole(d.remitted)} />
      </View>
      <View style={styles.figures}>
        <Stat label="Commission" value={whole(d.commission)} />
        <Stat
          label="Credit limit"
          value={d.creditLimit == null ? "None" : whole(d.creditLimit)}
          tone={d.overLimit ? "danger" : undefined}
        />
      </View>

      <Text step="small" tone="muted">
        Terms:{" "}
        {d.terms.kind === "FLAT" ? `${whole(d.terms.rate)} per booking` : `${d.terms.rate}% of rent`}
        {d.agency.phone ? ` · ${d.agency.phone}` : ""}
      </Text>

      {mayManage ? (
        <Button label="Received from agent" onPress={() => setWriting(true)} />
      ) : null}

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
              meta={[r.trxId, r.note, r.status === "PENDING" ? "declared, not confirmed" : null]
                .filter(Boolean)
                .join(" · ")}
              last={i === d.rows.length - 1}
              onPress={
                mayManage && r.status === "PENDING" && confirming !== r.id
                  ? () => void confirm(r.id)
                  : undefined
              }
              accessibilityLabel={`${agentEntryLabel(r.kind)}, ${whole(Math.abs(r.amount))}, ${dayLabel(r.date)}${
                r.status === "PENDING" ? ", declared, tap to confirm" : ""
              }`}
              right={
                <Text step="body" weight="medium" tone={r.amount > 0 ? "danger" : "ok"} tabular>
                  {r.amount > 0 ? "+" : "−"}
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

/**
 * The twenty-second door.
 *
 * What came in, and what the agent kept. The guest's bill is credited with the
 * sum of both, because that is what the guest paid — recording only what
 * arrived is the bug this screen exists to end.
 *
 * The commission box is pre-filled from the terms and is *meant* to be
 * overwritten: what the two agreed on the telephone is the fact, and the rate is
 * only a guess about it.
 */
function Received({
  statement,
  resortId,
  agencyId,
  timezone,
  onClose,
  onSaved,
}: {
  statement: AgentStatement;
  resortId: number;
  agencyId: number;
  timezone: string | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const money = useMoneyFormat();
  const whole = (amount: number) => formatMoney(amount, { ...money, decimals: 0 });

  const [amount, setAmount] = useState("");
  const [commission, setCommission] = useState("");
  const [bookingId, setBookingId] = useState<number | null>(null);
  const [method, setMethod] = useState(statement.methods[0]?.code ?? "");
  const [trxId, setTrxId] = useState("");
  const [note, setNote] = useState("");
  const [refused, setRefused] = useState<string | null>(null);

  /** The stays already on this account, so a code never has to be typed. */
  const stays = [
    ...new Map(
      statement.rows.filter((r) => r.booking).map((r) => [r.booking!.code, r.booking!]),
    ).values(),
  ];

  const save = useAction(async () => {
    setRefused(null);
    const got = Number(amount) || 0;
    const kept = Number(commission) || 0;
    if (got <= 0 && kept <= 0) {
      setRefused("Put in how much came in.");
      return;
    }
    try {
      await client.agentAccounts.received(resortId, agencyId, {
        amount: got,
        commission: kept,
        bookingId: bookingId ?? undefined,
        method,
        trxId: trxId.trim() || undefined,
        /**
         * The resort's today, not the phone's. Bangladesh is UTC+6, so for six
         * hours after midnight `toISOString()` would file the money on the day
         * before — and a settlement on the wrong day is one that cannot be
         * matched against a bank statement.
         */
        date: todayIn(timezone),
        note: note.trim() || undefined,
      });
      onSaved();
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That did not go through.");
    }
  });

  const credited = (Number(amount) || 0) + (Number(commission) || 0);

  return (
    <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
      <Text step="strong" tone="title" weight="medium">
        Money from {statement.agency.name}
      </Text>

      <Field label="What came in">
        <Input
          value={amount}
          onChangeText={setAmount}
          keyboardType="number-pad"
          placeholder="0"
          accessibilityLabel="What came in"
        />
      </Field>

      <Field
        label="What the agent kept"
        hint={
          statement.terms.kind === "FLAT"
            ? `Their terms are ${whole(statement.terms.rate)} a booking`
            : `Their terms are ${statement.terms.rate}% of rent`
        }
      >
        <Input
          value={commission}
          onChangeText={setCommission}
          keyboardType="number-pad"
          placeholder="0"
          accessibilityLabel="What the agent kept"
        />
      </Field>

      {stays.length > 0 ? (
        <Field label="Which stay" hint="Leave it off for a settlement covering several">
          <View style={styles.chips}>
            {stays.map((b) => (
              <Chip
                key={b.id}
                label={b.code}
                on={bookingId === b.id}
                onPress={() => setBookingId((now) => (now === b.id ? null : b.id))}
              />
            ))}
          </View>
        </Field>
      ) : null}

      <Field label="How it came">
        <View style={styles.chips}>
          {statement.methods.map((m) => (
            <Chip key={m.code} label={m.label} on={method === m.code} onPress={() => setMethod(m.code)} />
          ))}
        </View>
      </Field>

      <Field label="Transaction id" hint="The bKash or bank reference">
        <Input
          value={trxId}
          onChangeText={setTrxId}
          placeholder="Optional"
          accessibilityLabel="Transaction id"
        />
      </Field>

      <Field label="Note" hint="Optional">
        <Input value={note} onChangeText={setNote} placeholder="Anything worth remembering" accessibilityLabel="Note" />
      </Field>

      {credited > 0 && bookingId != null ? (
        <Text step="small" tone="muted">
          The guest&rsquo;s bill gets {whole(credited)} — what arrived plus what was kept, because
          that is what the guest paid.
        </Text>
      ) : null}

      {refused ? (
        <Text step="small" tone="danger" weight="medium">
          {refused}
        </Text>
      ) : null}

      <Button label="Record it" loading={save.busy} onPress={save.go} />
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
