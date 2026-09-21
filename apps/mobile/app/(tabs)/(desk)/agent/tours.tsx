/**
 * The packages an agency sells, what it makes on each, and building one.
 *
 * Building was on the desk until 2026-09-21, and the reason given was
 * that a package is line-by-line work — a jeep, two nights, three meals
 * — where getting one line wrong is a tour sold at a loss. True, and not
 * a reason to make it impossible from a phone: the agency that reported
 * *"can't add any package"* is the one whose owner does this on a bus.
 *
 * The care the desk-only note was protecting is kept where it does some
 * good: **cost sits beside price on every line, and the margin is drawn
 * while the package is being written**, not after it is saved. An agency
 * that cannot see its own margin while quoting finds it out after the
 * trip.
 *
 * Categories are not asked for here. A line may carry one and does not
 * need one, the tree is the agency's own and starts empty, and a tree
 * picker is the worst thing on this screen to build for a thumb.
 */
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { useApi } from "@rh/app-core";
import {
  formatMoney,
  type NewTourPackage,
  type TourPackageLineInput,
  type TourPackageRow,
} from "@rh/shared";
import { client, useAuth } from "../../../../src/api/session";
import { Button } from "../../../../src/design/button";
import { Counter } from "../../../../src/design/counter";
import { Field, Input } from "../../../../src/design/input";
import { useMoneyFormat } from "../../../../src/design/money";
import { Empty, Loading, Problem, Stale } from "../../../../src/design/states";
import { Card, Row } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { useAction } from "../../../../src/design/use-action";
import { color, radius, space } from "../../../../src/design/tokens";

export default function AgentToursScreen() {
  const { me, can } = useAuth();
  const money = useMoneyFormat();
  const whole = (n: number) => formatMoney(n, { ...money, decimals: 0 });
  const mayManage = can("agent.tours.manage");
  const [adding, setAdding] = useState(false);

  const list = useApi<TourPackageRow[]>(
    ["agent-tours"],
    () => client.agent.tours.packages(),
    { enabled: Boolean(me) },
  );

  const header = <Stack.Screen options={{ title: "Tours" }} />;

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
        <Loading what="the packages" />
      </>
    );
  }

  const rows = list.data;

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
        <Card title={`${rows.length} package${rows.length === 1 ? "" : "s"}`}>
          {rows.length === 0 ? (
            <View style={styles.emptyBox}>
              <Empty
                message="No packages yet"
                hint={
                  mayManage
                    ? "Build one line by line — a jeep, two nights, three meals."
                    : "Ask the agency's owner to build one."
                }
              />
            </View>
          ) : (
            rows.map((p, i) => (
              <Row
                key={p.id}
                title={p.name}
                subtitle={p.summary ?? undefined}
                meta={`${p.days} day${p.days === 1 ? "" : "s"}, ${p.nights} night${
                  p.nights === 1 ? "" : "s"
                } · ${p.pax} people · ${p.lines} line${p.lines === 1 ? "" : "s"}${
                  p.active ? "" : " · not on sale"
                }`}
                last={i === rows.length - 1}
                accessibilityLabel={`${p.name}, ${p.days} days and ${p.nights} nights for ${
                  p.pax
                } people, sells at ${whole(p.totals.price)}, margin ${whole(p.totals.margin)}${
                  p.active ? "" : ", not on sale"
                }`}
                right={
                  <View style={styles.right}>
                    <Text
                      step="body"
                      weight="medium"
                      tone={p.active ? "title" : "muted"}
                      tabular
                    >
                      {whole(p.totals.price)}
                    </Text>
                    {/* the margin, because the price alone is not the
                        business — it is the difference that is */}
                    <Text step="caption" tone={p.totals.margin > 0 ? "ok" : "danger"} tabular>
                      {whole(p.totals.margin)} margin
                    </Text>
                  </View>
                }
              />
            ))
          )}
        </Card>

        {adding ? (
          <PackageBuilder
            onClose={() => setAdding(false)}
            onSaved={async () => {
              setAdding(false);
              await list.refetch();
            }}
          />
        ) : mayManage ? (
          <Button label="Build a package" kind="ghost" onPress={() => setAdding(true)} />
        ) : null}

        <Text step="caption" tone="muted" style={styles.footnote}>
          Every line carries a cost and a price. The margin is the business, so
          it is on screen while you write rather than after you save.
        </Text>
      </ScrollView>
    </>
  );
}

interface Line extends TourPackageLineInput {
  /** Stable across removals, which an index is not. */
  key: string;
  qty: number;
  unitCost: number;
  unitPrice: number;
}

/**
 * A package being written, line by line, with the margin running.
 *
 * The totals are computed here and are the same arithmetic the server
 * does — `Σ qty × unit` for each side. That is a second implementation
 * and it is deliberate: this figure never reaches a client and never
 * gets stored, it exists so the person typing can see a line priced
 * below cost at the moment they type it. What the package is worth is
 * whatever the server says when it comes back in the list.
 */
function PackageBuilder({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const money = useMoneyFormat();
  const whole = (n: number) => formatMoney(n, { ...money, decimals: 0 });

  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [days, setDays] = useState(2);
  const [nights, setNights] = useState(1);
  const [pax, setPax] = useState(2);
  const [lines, setLines] = useState<Line[]>([]);
  const [tried, setTried] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  /**
   * Minted once, when the form opens, so the same package replayed by
   * the outbox after a dropped connection is still one package. Minting
   * it at send time would make every retry a new tour.
   */
  const [ref] = useState(() => `pkg-${Date.now()}`);

  const priced = lines.filter((l) => l.label.trim());
  const cost = priced.reduce((s, l) => s + l.qty * l.unitCost, 0);
  const price = priced.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const incomplete = !name.trim() || priced.length === 0;

  const edit = (key: string, patch: Partial<Line>) =>
    setLines((now) => now.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const save = useAction(async () => {
    if (incomplete) {
      setTried(true);
      return;
    }
    setRefused(null);
    try {
      const body: NewTourPackage = {
        name: name.trim(),
        summary: summary.trim() || undefined,
        days,
        nights,
        pax,
        clientRef: ref,
        items: priced.map((l) => ({
          label: l.label.trim(),
          qty: l.qty,
          unitCost: l.unitCost,
          unitPrice: l.unitPrice,
        })),
      };
      await client.agent.tours.createPackage(body);
      await onSaved();
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That did not go through.");
    }
  });

  return (
    <Card title="A new package">
      <View style={styles.fields}>
        <Field label="Name" error={tried && !name.trim() ? "A package needs a name." : null}>
          <Input
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (text.trim()) setTried(false);
            }}
            placeholder="Sajek weekend"
            autoCapitalize="words"
            invalid={tried && !name.trim()}
          />
        </Field>

        <Field label="Summary" hint="Optional — the line a client reads first">
          <Input
            value={summary}
            onChangeText={setSummary}
            placeholder="Two nights, jeep both ways, all meals"
          />
        </Field>

        <Field label="Days">
          <Counter label="day" min={1} value={days} onChange={setDays} />
        </Field>
        <Field label="Nights">
          <Counter label="night" min={0} value={nights} onChange={setNights} />
        </Field>
        <Field label="People">
          <Counter label="person" min={1} value={pax} onChange={setPax} />
        </Field>

        {lines.map((line) => (
          <View key={line.key} style={styles.line}>
            <Field label="What it is">
              <Input
                value={line.label}
                onChangeText={(text) => {
                  edit(line.key, { label: text });
                  if (text.trim()) setTried(false);
                }}
                placeholder="Jeep, Khagrachari to Sajek"
              />
            </Field>
            <Field label="How many">
              <Counter
                label={line.label.trim() || "line"}
                min={1}
                value={line.qty}
                onChange={(qty) => edit(line.key, { qty })}
              />
            </Field>
            <View style={styles.pair}>
              <View style={styles.half}>
                <Field label="Costs us, each">
                  <Input
                    value={line.unitCost ? String(line.unitCost) : ""}
                    onChangeText={(text) =>
                      edit(line.key, { unitCost: Number(text.replace(/[^0-9.]/g, "")) || 0 })
                    }
                    placeholder="0"
                    keyboardType="numeric"
                  />
                </Field>
              </View>
              <View style={styles.half}>
                <Field label="We charge, each">
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
              { key: `${Date.now()}-${now.length}`, label: "", qty: 1, unitCost: 0, unitPrice: 0 },
            ])
          }
        />

        {tried && priced.length === 0 ? (
          <Text step="small" tone="danger" weight="medium">
            A package is its lines — put at least one on it.
          </Text>
        ) : null}

        {priced.length > 0 ? (
          <View style={styles.totals}>
            <Text step="small" tone="muted">
              Costs {whole(cost)} · sells at {whole(price)}
            </Text>
            <Text
              step="body"
              weight="medium"
              tone={price - cost > 0 ? "ok" : "danger"}
              tabular
              accessibilityLabel={`Margin ${whole(price - cost)}`}
            >
              {whole(price - cost)} margin
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

        <Button label="Save the package" loading={save.busy} onPress={save.go} />
        <Button label="Cancel" kind="ghost" onPress={onClose} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  right: { alignItems: "flex-end", gap: 2 },
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
