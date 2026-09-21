/**
 * What the agency quoted, what it billed, what is still owed — and
 * writing one.
 *
 * An agency quotes, the client accepts, the quote becomes an invoice and
 * the money comes in. Writing the document was desk work until
 * 2026-09-21, on the grounds that line items, a tax rate and terms are
 * not one-handed. The agency's answer was *"at quotes no invoice and
 * quote are available"* — which is what a sales tool that cannot make a
 * sale looks like from the outside.
 *
 * So the form is here, and what the desk-only note was protecting is
 * kept: the lines are the document's own, the total is drawn as it is
 * typed, and the printed copy a client keeps is still the desk's job.
 *
 * The status decides what a row means. A quote that expired, one that
 * was declined, an invoice already paid and a voided document are all
 * finished, and counting any of them as outstanding sends somebody
 * chasing money they already have or never will.
 */
import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, router } from "expo-router";
import { useApi } from "@rh/app-core";
import {
  addDaysIso,
  dayLabel,
  formatMoney,
  todayIn,
  PLATFORM_TIMEZONE,
  type NewSalesDoc,
  type SalesDocKind,
  type SalesDocRow,
  type SalesDocStatus,
  type TourPackageRow,
} from "@rh/shared";
import { client, useAuth } from "../../../src/api/session";
import { Button } from "../../../src/design/button";
import { Chip } from "../../../src/design/chip";
import { Counter } from "../../../src/design/counter";
import { DateNav } from "../../../src/design/date-nav";
import { Field, Input } from "../../../src/design/input";
import { useMoneyFormat } from "../../../src/design/money";
import { Empty, Loading, Problem, Stale } from "../../../src/design/states";
import { Card, Row, Stat } from "../../../src/design/surface";
import { Text } from "../../../src/design/text";
import { Toggle } from "../../../src/design/toggle";
import { useAction } from "../../../src/design/use-action";
import { color, radius, space } from "../../../src/design/tokens";

/**
 * Finished, one way or another.
 *
 * `due` alone is not enough: a voided invoice can carry a balance and is
 * not money coming. The status is the fact and the figure follows it.
 */
const SETTLED: SalesDocStatus[] = ["PAID", "VOID", "DECLINED", "EXPIRED"];

const owing = (d: SalesDocRow) => !SETTLED.includes(d.status) && d.totals.due > 0;

const LENSES = ["All", "Unpaid"] as const;

export default function AgentSalesScreen() {
  const { me, can } = useAuth();
  const money = useMoneyFormat();
  const whole = (n: number) => formatMoney(n, { ...money, decimals: 0 });
  const [lens, setLens] = useState<(typeof LENSES)[number]>("All");
  const mayWrite = can("agent.sales.manage");
  const [writing, setWriting] = useState(false);

  const list = useApi<SalesDocRow[]>(["agent-sales"], () => client.agent.sales.list(), {
    enabled: Boolean(me),
  });

  const all = useMemo(() => list.data ?? [], [list.data]);
  const outstanding = useMemo(
    () => all.filter(owing).reduce((s, d) => s + d.totals.due, 0),
    [all],
  );
  const shown = lens === "Unpaid" ? all.filter(owing) : all;

  /**
   * No `title` here. A tab is named by the bar, which runs the
   * console's label through `barLabel` so it fits; a title set on the
   * screen overrides that from underneath and the bar goes back to
   * an ellipsis. `a-tab-does-not-name-itself.spec.ts` is the rule.
   */
  const header = null;

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
        <Loading what="the quotes and invoices" />
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
          <Stat
            label="Outstanding"
            value={whole(outstanding)}
            sub={`${all.filter(owing).length} document${all.filter(owing).length === 1 ? "" : "s"}`}
            tone={outstanding > 0 ? "danger" : "title"}
          />
          <Stat label="On the books" value={String(all.length)} sub="quotes and invoices" />
        </View>

        <View style={styles.lenses}>
          {LENSES.map((l) => (
            <Chip key={l} label={l} on={lens === l} onPress={() => setLens(l)} />
          ))}
        </View>

        <Card title={lens === "Unpaid" ? "Unpaid" : "Everything"}>
          {shown.length === 0 ? (
            <View style={styles.emptyBox}>
              <Empty
                message={lens === "Unpaid" ? "Nothing outstanding" : "Nothing quoted yet"}
                hint={
                  lens === "Unpaid"
                    ? "Every document on the books is settled."
                    : mayWrite
                      ? "Write one and it appears here."
                      : "Quotes your agency writes appear here."
                }
              />
            </View>
          ) : (
            shown.map((d, i) => (
              <Row
                key={d.id}
                title={d.number}
                subtitle={d.clientName}
                meta={`${kindOf(d)} · ${statusOf(d.status)} · ${dayLabel(d.issueDate, { style: "short" })}`}
                last={i === shown.length - 1}
                accessibilityLabel={`${d.number}, ${kindOf(d)} for ${d.clientName}, ${statusOf(
                  d.status,
                )}, ${owing(d) ? `${whole(d.totals.due)} due` : "settled"}`}
                onPress={() => router.push(`/agent/sales/${d.id}` as never)}
                right={
                  owing(d) ? (
                    <View style={styles.right}>
                      <Text step="caption" tone="muted">
                        due
                      </Text>
                      <Text step="body" weight="medium" tone="danger" tabular>
                        {whole(d.totals.due)}
                      </Text>
                    </View>
                  ) : (
                    <Text step="small" tone="muted">
                      {statusOf(d.status).toLowerCase()}
                    </Text>
                  )
                }
              />
            ))
          )}
        </Card>

        {writing ? (
          <WriteDocument
            onClose={() => setWriting(false)}
            onSaved={async (id) => {
              setWriting(false);
              await list.refetch();
              router.push(`/agent/sales/${id}` as never);
            }}
          />
        ) : mayWrite ? (
          <Button label="Write a document" kind="ghost" onPress={() => setWriting(true)} />
        ) : null}

        <Text step="caption" tone="muted" style={styles.footnote}>
          The printed copy a client keeps stays on the desk — it is a page, not
          a screen.
        </Text>
      </ScrollView>
    </>
  );
}

interface Line {
  /** Stable across removals, which an index is not. */
  key: string;
  label: string;
  qty: number;
  unitPrice: number;
}

/**
 * Filling the lines from a package the agency already priced.
 *
 * The packages are read lazily — the list is only fetched once somebody
 * opens the form, because most documents are written without one and an
 * agent on a hill road should not spend a request on a list they will
 * not look at.
 *
 * Nothing is shown at all where the agency has no packages. A picker
 * with nothing in it is a row of "you could have used a feature you do
 * not have", which is the kind of empty state this app deletes.
 */
function FromPackage({
  chosen,
  onPick,
}: {
  chosen: number | null;
  onPick: (packageId: number, lines: Line[]) => void;
}) {
  const [refused, setRefused] = useState<string | null>(null);

  const packages = useApi<TourPackageRow[]>(
    ["agent-tours"],
    () => client.agent.tours.packages(),
    { staleTime: 3_600_000 },
  );
  const sellable = (packages.data ?? []).filter((p) => p.active);

  const pick = async (pkg: TourPackageRow) => {
    setRefused(null);
    try {
      const full = await client.agent.tours.package(pkg.id);
      onPick(
        pkg.id,
        full.items.map((i, n) => ({
          key: `pkg-${pkg.id}-${n}`,
          label: i.label,
          qty: i.qty,
          unitPrice: i.unitPrice,
        })),
      );
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That package would not open.");
    }
  };

  if (sellable.length === 0) return null;

  return (
    <Field label="From a package" hint="Fills the lines in — they stay editable">
      <View style={styles.lenses}>
        {sellable.map((pkg) => (
          <Chip
            key={pkg.id}
            label={pkg.name}
            on={chosen === pkg.id}
            onPress={() => void pick(pkg)}
          />
        ))}
      </View>
      {refused ? (
        <Text step="small" tone="danger" weight="medium">
          {refused}
        </Text>
      ) : null}
    </Field>
  );
}

/**
 * A quotation or an invoice, written on a phone.
 *
 * The kind is asked first because it is the one thing that cannot be
 * changed afterwards by editing: a quotation *becomes* an invoice by
 * being converted, which is a different act with a link between the two
 * documents. Choosing wrong and saving leaves a document to void.
 *
 * `taxRate` and `discount` are on the form because leaving them off
 * would mean every document written from a phone quietly charged no tax
 * — and an agency whose quotes are tax-exclusive on the desk and
 * tax-free on the phone has two prices for one trip.
 *
 * The running total is this screen's own arithmetic and reaches no
 * client. What the document is worth is whatever the server says when it
 * comes back; this exists so the person typing can see the figure they
 * are about to send.
 */
function WriteDocument({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (id: number) => Promise<void>;
}) {
  const money = useMoneyFormat();
  const whole = (n: number) => formatMoney(n, { ...money, decimals: 0 });

  const [kind, setKind] = useState<SalesDocKind>("QUOTATION");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  // an agency has no resort and so no resort's day; its documents are dated
  // in the platform's zone, as every other agency screen is
  const [issueDate, setIssueDate] = useState(() => todayIn(PLATFORM_TIMEZONE));
  const [expires, setExpires] = useState(false);
  const [validUntil, setValidUntil] = useState(() =>
    addDaysIso(todayIn(PLATFORM_TIMEZONE), 14),
  );
  const [packageId, setPackageId] = useState<number | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [discount, setDiscount] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  const [notes, setNotes] = useState("");
  const [tried, setTried] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  /** Minted when the form opens, so a replayed write is still one document. */
  const [ref] = useState(() => `doc-${Date.now()}`);

  const priced = lines.filter((l) => l.label.trim());
  const net = Math.max(0, priced.reduce((s, l) => s + l.qty * l.unitPrice, 0) - discount);
  const total = net + (net * taxRate) / 100;
  const incomplete = !clientName.trim() || priced.length === 0;

  const edit = (key: string, patch: Partial<Line>) =>
    setLines((now) => now.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const save = useAction(async () => {
    if (incomplete) {
      setTried(true);
      return;
    }
    setRefused(null);
    try {
      const body: NewSalesDoc = {
        kind,
        clientName: clientName.trim(),
        clientPhone: clientPhone.trim() || undefined,
        clientEmail: clientEmail.trim() || undefined,
        issueDate,
        validUntil: expires ? validUntil : undefined,
        packageId: packageId ?? undefined,
        discount,
        taxRate,
        notes: notes.trim() || undefined,
        clientRef: ref,
        items: priced.map((l) => ({
          label: l.label.trim(),
          qty: l.qty,
          unitPrice: l.unitPrice,
        })),
      };
      const made = await client.agent.sales.create(body);
      await onSaved(made.id);
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That did not go through.");
    }
  });

  return (
    <Card title="A new document">
      <View style={styles.fields}>
        <Field
          label="What it is"
          hint="A quotation becomes an invoice by being converted, not by being edited"
        >
          <View style={styles.lenses}>
            <Chip
              label="Quotation"
              on={kind === "QUOTATION"}
              onPress={() => setKind("QUOTATION")}
            />
            <Chip label="Invoice" on={kind === "INVOICE"} onPress={() => setKind("INVOICE")} />
          </View>
        </Field>

        <Field label="Client" error={tried && !clientName.trim() ? "Say who it is for." : null}>
          <Input
            value={clientName}
            onChangeText={(text) => {
              setClientName(text);
              if (text.trim()) setTried(false);
            }}
            placeholder="Nasrin Akter"
            autoCapitalize="words"
            invalid={tried && !clientName.trim()}
          />
        </Field>

        <Field label="Phone">
          <Input
            value={clientPhone}
            onChangeText={setClientPhone}
            placeholder="01712345678"
            keyboardType="phone-pad"
          />
        </Field>

        <Field label="Email" hint="Where a copy would be sent from the desk">
          <Input
            value={clientEmail}
            onChangeText={setClientEmail}
            placeholder="nasrin@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </Field>

        <DateNav what="Dated" value={issueDate} onChange={setIssueDate} />

        {/*
          A quotation with no expiry is a price the agency is bound to for
          ever. The list screen already prints "valid to …" on the rows
          that have one; nothing on the phone could set it.
        */}
        <Toggle
          label="Expires"
          hint="A quoted price that never runs out is one a client can hold you to next season"
          value={expires}
          onChange={setExpires}
        />
        {expires ? (
          <DateNav
            what="Valid until"
            home={false}
            value={validUntil}
            onChange={(day) => (day > issueDate ? setValidUntil(day) : undefined)}
          />
        ) : null}

        {/*
          The whole reason packages exist.

          An agency that has already priced a Sajek weekend line by line
          should not retype it to quote for one. Picking a package fills
          the lines in and they stay editable afterwards — the console's
          rule, and the reason the lines live on the document rather than
          on the package: repricing the package next month must not
          rewrite a quote sent last month.
        */}
        <FromPackage
          chosen={packageId}
          onPick={(pkg, items) => {
            setPackageId(pkg);
            setLines(items);
            setTried(false);
          }}
        />

        {lines.map((line) => (
          <View key={line.key} style={styles.line}>
            <Field label="What for">
              <Input
                value={line.label}
                onChangeText={(text) => {
                  edit(line.key, { label: text });
                  if (text.trim()) setTried(false);
                }}
                placeholder="Sajek weekend, two nights"
              />
            </Field>
            {/*
              Side by side, because a line stacked four rows deep makes a
              three-line quote a screen and a half of scrolling — seen by
              filling one from a package, which is the common case rather
              than the rare one.
            */}
            <View style={styles.pair}>
              <View style={styles.half}>
                <Field label="How many">
                  <Counter
                    label={line.label.trim() || "line"}
                    min={1}
                    value={line.qty}
                    onChange={(qty) => edit(line.key, { qty })}
                  />
                </Field>
              </View>
              <View style={styles.half}>
                <Field label="Each">
                  <Input
                    value={line.unitPrice ? String(line.unitPrice) : ""}
                    onChangeText={(text) =>
                      edit(line.key, { unitPrice: Number(text.replace(/[^0-9.]/g, "")) || 0 })
                    }
                    placeholder="0"
                    keyboardType="numeric"
                  />
                </Field>
              </View>
            </View>
            <Button
              label="Take this line off"
              kind="ghost"
              accessibilityLabel={`Remove ${line.label.trim() || "the empty line"}`}
              onPress={() => setLines((now) => now.filter((l) => l.key !== line.key))}
            />
          </View>
        ))}

        <Button
          label="Add a line"
          kind="ghost"
          onPress={() =>
            setLines((now) => [
              ...now,
              { key: `${Date.now()}-${now.length}`, label: "", qty: 1, unitPrice: 0 },
            ])
          }
        />

        {tried && priced.length === 0 ? (
          <Text step="small" tone="danger" weight="medium">
            A document is its lines — put at least one on it.
          </Text>
        ) : null}

        <View style={styles.pair}>
          <View style={styles.half}>
            <Field label="Discount">
              <Input
                value={discount ? String(discount) : ""}
                onChangeText={(text) => setDiscount(Number(text.replace(/[^0-9.]/g, "")) || 0)}
                placeholder="0"
                keyboardType="numeric"
              />
            </Field>
          </View>
          <View style={styles.half}>
            <Field label="Tax %">
              <Input
                value={taxRate ? String(taxRate) : ""}
                onChangeText={(text) => setTaxRate(Number(text.replace(/[^0-9.]/g, "")) || 0)}
                placeholder="0"
                keyboardType="numeric"
              />
            </Field>
          </View>
        </View>

        <Field label="Notes" hint="Optional — what the client should read under the figures">
          <Input value={notes} onChangeText={setNotes} placeholder="Half now, half on arrival" />
        </Field>

        {priced.length > 0 ? (
          <View style={styles.totals}>
            <Text step="small" tone="muted">
              {whole(net)} plus {taxRate}% tax
            </Text>
            <Text step="body" weight="medium" tone="title" tabular>
              {whole(total)}
            </Text>
          </View>
        ) : null}

        {refused ? (
          <View style={styles.refused}>
            <Text step="small" tone="danger" weight="medium">
              {refused}
            </Text>
          </View>
        ) : null}

        <Button label="Save it" loading={save.busy} onPress={save.go} />
        <Button label="Cancel" kind="ghost" onPress={onClose} />
      </View>
    </Card>
  );
}

/** "Quotation" or "Invoice" — the two are not the same promise. */
function kindOf(d: SalesDocRow): string {
  return d.kind === "QUOTATION" ? "Quotation" : "Invoice";
}

/** Sentence case, as everywhere else in this app. */
function statusOf(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  figures: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  lenses: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  right: { alignItems: "flex-end" },
  emptyBox: { paddingVertical: space.lg },
  footnote: { textAlign: "center" },
  fields: { gap: space.md },
  pair: { flexDirection: "row", gap: space.md },
  half: { flex: 1 },
  line: {
    gap: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
  },
  totals: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    backgroundColor: color.ink[50],
    borderRadius: radius.md,
    padding: space.md,
  },
  refused: {
    backgroundColor: color.danger.bg,
    borderWidth: 1,
    borderColor: color.danger.line,
    borderRadius: radius.md,
    padding: space.md,
  },
});
