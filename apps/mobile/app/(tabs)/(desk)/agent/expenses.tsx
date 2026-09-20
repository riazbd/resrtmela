/**
 * What the agency spends, under the heads it keeps.
 *
 * Unlike the resort side, where a category is typed per entry, an agency
 * defines its heads first and files under them. That is what makes a
 * head-by-head total possible at all — free text produces "Fuel", "fuel"
 * and "Fuel " in the same report.
 *
 * Filing an entry is on the phone because it is the thing that happens
 * on the road: a tank of fuel on the way back from Sajek. Defining a
 * head is a decision about how the books are organised, made once, and
 * the screen says where it happens.
 *
 * The entry goes through the outbox. A hill-district connection drops,
 * and an expense typed at a petrol pump should not need the road back to
 * be typed again — the queued write carries its own reference, so a
 * replay is still one entry.
 */
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { useApi, useQueryClient } from "@rh/app-core";
import {
  addDaysIso,
  dayLabel,
  formatMoney,
  PLATFORM_TIMEZONE,
  todayIn,
  type AgencyExpensePage,
  type ExpenseHeadRow,
} from "@rh/shared";
import { client, useAuth } from "../../../../src/api/session";
import { Button } from "../../../../src/design/button";
import { Chip } from "../../../../src/design/chip";
import { DateNav } from "../../../../src/design/date-nav";
import { Field, Input } from "../../../../src/design/input";
import { useMoneyFormat } from "../../../../src/design/money";
import { Empty, Loading, Problem, Stale } from "../../../../src/design/states";
import { Card, Row, Stat } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { useAction } from "../../../../src/design/use-action";
import { color, radius, space } from "../../../../src/design/tokens";

export default function AgentExpensesScreen() {
  const { me } = useAuth();
  const money = useMoneyFormat();
  const whole = (n: number) => formatMoney(n, { ...money, decimals: 0 });

  // an agency has no resort and so no resort's timezone. It was
  // `todayIn(undefined)`, which reads as "no zone in particular" and
  // means UTC — a day behind in Dhaka until six in the morning.
  const today = todayIn(PLATFORM_TIMEZONE);
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [adding, setAdding] = useState(false);

  const page = useApi<AgencyExpensePage>(
    ["agent-expenses", from, to],
    () => client.agent.books.expenses({ from, to }),
    { enabled: Boolean(me) },
  );
  const heads = useApi<ExpenseHeadRow[]>(
    ["agent-heads"],
    () => client.agent.books.heads(),
    { enabled: Boolean(me), staleTime: 3_600_000 },
  );

  const header = <Stack.Screen options={{ title: "Expenses" }} />;

  if (page.error && !page.data) {
    return (
      <>
        {header}
        <Problem error={page.error} onRetry={() => void page.refetch()} />
      </>
    );
  }

  if (!page.data) {
    return (
      <>
        {header}
        <Loading what="what was spent" />
      </>
    );
  }

  const data = page.data;
  const open = (heads.data ?? []).filter((h) => h.active);

  return (
    <>
      {header}
      <Stale age={page.stale} />
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={page.isRefetching} onRefresh={() => void page.refetch()} />
        }
      >
        <View style={styles.figures}>
          <Stat label="Spent" value={whole(data.summary.amount)} sub="over this range" />
          <Stat label="Entries" value={String(data.total)} />
        </View>

        <Card title="The range">
          <View style={styles.fields}>
            <DateNav
              what="From"
              home={false}
              value={from}
              onChange={(day) => {
                setFrom(day);
                if (day > to) setTo(day);
              }}
            />
            <DateNav
              what="To"
              home={false}
              value={to}
              onChange={(day) => (day >= from ? setTo(day) : undefined)}
            />
          </View>
        </Card>

        {data.summary.byHead.length > 0 ? (
          <Card title="Under each head">
            {data.summary.byHead.map((h, i) => (
              <Row
                key={String(h.headId ?? h.head)}
                title={h.head}
                last={i === data.summary.byHead.length - 1}
                accessibilityLabel={`${h.head}, ${whole(h.amount)}`}
                right={
                  <Text step="body" weight="medium" tone="title" tabular>
                    {whole(h.amount)}
                  </Text>
                }
              />
            ))}
          </Card>
        ) : null}

        <Card
          title="Entries"
          action={
            open.length > 0 ? (
              <Button
                label={adding ? "Close" : "Add"}
                kind="ghost"
                block={false}
                onPress={() => setAdding((o) => !o)}
              />
            ) : undefined
          }
        >
          {data.rows.length === 0 ? (
            <View style={styles.emptyBox}>
              <Empty
                message="Nothing filed in this range"
                hint={
                  open.length === 0
                    ? "There are no heads to file under yet."
                    : "Add the first one above."
                }
              />
            </View>
          ) : (
            data.rows.map((row, i) => (
              <Row
                key={row.id}
                title={row.head}
                subtitle={row.details ?? undefined}
                meta={dayLabel(row.date, { style: "full" })}
                last={i === data.rows.length - 1}
                accessibilityLabel={`${row.head}${row.details ? `, ${row.details}` : ""}, ${whole(
                  row.amount,
                )}, ${dayLabel(row.date, { style: "full" })}`}
                right={
                  <Text step="body" weight="medium" tone="title" tabular>
                    {whole(row.amount)}
                  </Text>
                }
              />
            ))
          )}
        </Card>

        {adding && open.length > 0 ? (
          <NewEntry
            heads={open}
            onDone={() => {
              setAdding(false);
              void page.refetch();
            }}
          />
        ) : null}

        <Text step="caption" tone="muted" style={styles.footnote}>
          Heads — office rent, fuel, salaries — are defined on the desk. They
          decide how a year of reports adds up, so they are set once and not
          invented at a petrol pump.
        </Text>
      </ScrollView>
    </>
  );
}

function NewEntry({ heads, onDone }: { heads: ExpenseHeadRow[]; onDone: () => void }) {
  const qc = useQueryClient();
  const [headId, setHeadId] = useState(heads[0]?.id ?? 0);
  const [date, setDate] = useState(todayIn(PLATFORM_TIMEZONE));
  const [details, setDetails] = useState("");
  const [amount, setAmount] = useState(0);
  const [tried, setTried] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const save = useAction(async () => {
    if (!(amount > 0) || !headId) {
      setTried(true);
      return;
    }
    setRefused(null);
    try {
      await client.agent.books.addExpense({
        date,
        headId,
        details: details.trim() || undefined,
        amount,
      });
      await qc.invalidateQueries({ queryKey: ["agent-expenses"] });
      onDone();
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That did not go through.");
    }
  });

  return (
    <Card title="A new entry">
      <View style={styles.fields}>
        <View style={styles.kinds}>
          {heads.map((h) => (
            <Chip
              key={h.id}
              label={h.name}
              on={headId === h.id}
              onPress={() => {
                setHeadId(h.id);
                setTried(false);
              }}
            />
          ))}
        </View>

        <DateNav what="Date" value={date} onChange={setDate} />

        <Field label="Amount" error={tried && !(amount > 0) ? "Say how much it was." : null}>
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

        <Field label="Details" hint="What it was for">
          <Input value={details} onChangeText={setDetails} placeholder="Sajek run" />
        </Field>

        {refused ? (
          <View style={styles.refused}>
            <Text step="small" tone="danger" weight="medium">
              {refused}
            </Text>
          </View>
        ) : null}

        <Button label="File it" loading={save.busy} onPress={save.go} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  figures: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  fields: { gap: space.md },
  kinds: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
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
