/**
 * One quote or invoice, and the money against it.
 *
 * The list answers "who has not paid". This answers "what did we say we
 * would do, and what is left" — the two questions between them are the
 * whole of what an agency owner needs away from the desk.
 *
 * The one write here is recording a payment, and it is here because it
 * is the one that happens away from a computer: a client hands over cash
 * at the counter, or says they have sent bKash, and the person taking it
 * has a phone in their hand. Everything else about a document — its
 * lines, its tax rate, its terms, converting a quote into an invoice,
 * sending it — is composed at the desk, and the screen says so.
 *
 * The reply to a payment carries the document's new arithmetic, so the
 * screen shows what the server worked out rather than subtracting on its
 * own. A balance computed twice is a balance that can disagree.
 */
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams, router } from "expo-router";
import { useApi } from "@rh/app-core";
import { dayLabel, formatMoney, type SalesDocDetail } from "@rh/shared";
import { client, useAuth } from "../../../../../src/api/session";
import { Button } from "../../../../../src/design/button";
import { Field, Input } from "../../../../../src/design/input";
import { useMoneyFormat } from "../../../../../src/design/money";
import { Empty, Loading, Problem } from "../../../../../src/design/states";
import { Card, Row, Stat } from "../../../../../src/design/surface";
import { Text } from "../../../../../src/design/text";
import { useAction } from "../../../../../src/design/use-action";
import { color, radius, space } from "../../../../../src/design/tokens";

export default function SalesDocScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const docId = Number(id);
  const { me } = useAuth();
  const money = useMoneyFormat();
  const exact = (n: number) => formatMoney(n, money);

  const doc = useApi<SalesDocDetail>(
    ["agent-sale", docId],
    () => client.agent.sales.get(docId),
    { enabled: Boolean(me) && Number.isFinite(docId) },
  );

  const header = <Stack.Screen options={{ title: doc.data?.number ?? "Document" }} />;

  if (!Number.isFinite(docId)) {
    return (
      <>
        {header}
        <Empty
          message="Open this from the list"
          hint="A document is found by its number, and this link carries none."
        />
      </>
    );
  }

  if (doc.error && !doc.data) {
    return (
      <>
        {header}
        <Problem error={doc.error} onRetry={() => void doc.refetch()} />
      </>
    );
  }

  if (!doc.data) {
    return (
      <>
        {header}
        <Loading what="the document" />
      </>
    );
  }

  const d = doc.data;
  const kind = d.kind === "QUOTATION" ? "Quotation" : "Invoice";

  return (
    <>
      {header}
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={doc.isRefetching} onRefresh={() => void doc.refetch()} />
        }
      >
        <View style={styles.figures}>
          <Stat label="Total" value={exact(d.totals.total)} />
          <Stat label="Paid" value={exact(d.totals.paid)} tone="ok" />
          <Stat
            label="Due"
            value={exact(d.totals.due)}
            tone={d.totals.due > 0 ? "danger" : "title"}
          />
        </View>

        <Card title={`${kind} · ${d.status.charAt(0)}${d.status.slice(1).toLowerCase()}`}>
          <Row title="For" meta={d.clientName} accessibilityLabel={`For ${d.clientName}`} />
          {d.clientPhone ? (
            <Row
              title="Phone"
              meta={d.clientPhone}
              accessibilityLabel={`Phone ${d.clientPhone}`}
            />
          ) : null}
          <Row
            title="Issued"
            meta={dayLabel(d.issueDate, { style: "full" })}
            accessibilityLabel={`Issued ${dayLabel(d.issueDate, { style: "full" })}`}
          />
          {d.validUntil ? (
            <Row
              title="Valid until"
              meta={dayLabel(d.validUntil, { style: "full" })}
              last
              accessibilityLabel={`Valid until ${dayLabel(d.validUntil, { style: "full" })}`}
            />
          ) : (
            <Row title="Sent" meta={d.sentAt ? "yes" : "not yet"} last accessibilityLabel={d.sentAt ? "Sent" : "Not sent yet"} />
          )}
        </Card>

        <Card title={`${d.items.length} line${d.items.length === 1 ? "" : "s"}`}>
          {d.items.length === 0 ? (
            <View style={styles.emptyBox}>
              <Empty message="Nothing on this document yet" />
            </View>
          ) : (
            d.items.map((line, i) => (
              <Row
                key={line.id}
                title={line.label}
                subtitle={line.details ?? undefined}
                meta={line.qty === 1 ? undefined : `${line.qty} × ${exact(line.unitPrice)}`}
                last={i === d.items.length - 1}
                accessibilityLabel={`${line.label}, ${line.qty} at ${exact(
                  line.unitPrice,
                )}, ${exact(line.amount)}`}
                right={
                  <Text step="body" weight="medium" tone="title" tabular>
                    {exact(line.amount)}
                  </Text>
                }
              />
            ))
          )}
        </Card>

        {d.totals.due > 0 ? <TakePayment doc={d} onDone={() => void doc.refetch()} /> : null}

        <Text step="caption" tone="muted" style={styles.footnote}>
          Lines, the tax rate, terms, sending it and turning a quote into an
          invoice are all done at the desk. Taking money is here because that
          is what happens away from one.
        </Text>
      </ScrollView>
    </>
  );
}

function TakePayment({ doc, onDone }: { doc: SalesDocDetail; onDone: () => void }) {
  const money = useMoneyFormat();
  const exact = (n: number) => formatMoney(n, money);
  const [amount, setAmount] = useState(Math.max(0, doc.totals.due));
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const take = useAction(async () => {
    if (!(amount > 0)) {
      setTried(true);
      return;
    }
    setRefused(null);
    try {
      await client.agent.sales.recordPayment(doc.id, {
        amount,
        note: note.trim() || undefined,
      });
      onDone();
      router.back();
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That did not go through.");
    }
  });

  return (
    <Card title="Money received">
      <View style={styles.fields}>
        <Field
          label="Amount"
          hint={`${exact(doc.totals.due)} outstanding`}
          error={tried && !(amount > 0) ? "Say how much came in." : null}
        >
          <Input
            value={amount ? String(amount) : ""}
            onChangeText={(text) => {
              const next = Number(text.replace(/[^0-9.]/g, "")) || 0;
              setAmount(next);
              if (next > 0) setTried(false);
            }}
            keyboardType="numeric"
            placeholder="0"
            invalid={tried && !(amount > 0)}
          />
        </Field>
        <Field label="Note" hint="How it came — cash, bKash, a transfer">
          <Input value={note} onChangeText={setNote} placeholder="Cash at the office" />
        </Field>

        {refused ? (
          <View style={styles.refused}>
            <Text step="small" tone="danger" weight="medium">
              {refused}
            </Text>
          </View>
        ) : null}

        <Button label="Record it" loading={take.busy} onPress={take.go} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  figures: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  fields: { gap: space.md },
  emptyBox: { paddingVertical: space.lg },
  footnote: { textAlign: "center" },
  refused: {
    backgroundColor: color.danger.bg,
    borderWidth: 1,
    borderColor: color.danger.line,
    borderRadius: radius.md,
    padding: space.md,
  },
});
