/**
 * The cashbook: what went out, and putting one in.
 *
 * A day at a time, like the console, because that is how a cashbook is
 * kept — the question is "what did we spend today", not "what did we
 * spend this year". The arrows move the day; the total is the server's
 * over every matching row, so a day with more entries than one page still
 * shows the true figure.
 *
 * The categories are the resort's own `EXPENSE_CATEGORY` list, not the
 * ones somebody has typed before. `expenses/categories` is a `groupBy`
 * over the rows: a category cannot exist until it has been spent on, and
 * "Salaries", "salary" and "Salery" stay three of them for ever — three
 * lines in every report. The API refuses a category that is not on the
 * list, so offering anything else would be offering a refusal.
 */
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { keys, useApi, useQueryClient } from "@rh/app-core";
import {
  addDaysIso,
  formatMoney,
  todayIn,
  type ExpensePage,
  type ExpenseRow,
  type ResortOption,
} from "@rh/shared";
import { client, useAuth } from "../../../src/api/session";
import { WhichResort } from "../../../src/screens/which-resort";
import { Button } from "../../../src/design/button";
import { Chip } from "../../../src/design/chip";
import { DateNav } from "../../../src/design/date-nav";
import { Field, Input } from "../../../src/design/input";
import { useMoneyFormat } from "../../../src/design/money";
import { Empty, Loading, Problem, Stale } from "../../../src/design/states";
import { Card, Row, Stat } from "../../../src/design/surface";
import { Text } from "../../../src/design/text";
import { useAction } from "../../../src/design/use-action";
import { color, radius, space } from "../../../src/design/tokens";

export default function ExpensesScreen() {
  const { activeResort, can } = useAuth();
  const resortId = activeResort?.id;
  const money = useMoneyFormat();
  const whole = (n: number) => formatMoney(n, { ...money, decimals: 0 });
  const qc = useQueryClient();

  /**
   * `null` means the resort's today, resolved on read — the day sheet's
   * lesson. An initialiser runs before the session has restored, when the
   * zone is still UTC, and the register opens on yesterday.
   */
  const [chosen, setDate] = useState<string | null>(null);
  const date = chosen ?? todayIn(activeResort?.timezone);
  const to = addDaysIso(date, 1);

  const [category, setCategory] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [amount, setAmount] = useState(0);
  const [tried, setTried] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const day = useApi(
    keys.expenses(resortId, date),
    () => client.expenses.list(resortId!, { from: date, to }),
    {
      enabled: resortId !== undefined,
      placeholderData: (prev: ExpensePage | undefined) => prev,
    },
  );

  const categories = useApi<ResortOption[]>(
    keys.expenseCategories(resortId),
    () => client.options.list(resortId!, "EXPENSE_CATEGORY"),
    { enabled: resortId !== undefined, staleTime: 3_600_000 },
  );
  const choices = (categories.data ?? []).filter((c) => c.active);

  const mayAdd = can("expenses.create");
  const incomplete = !category || !(amount > 0);

  const add = useAction(async () => {
    if (incomplete) {
      setTried(true);
      return;
    }
    setRefused(null);
    try {
      await client.expenses.create(resortId!, {
        date,
        category,
        details: details.trim() || undefined,
        amount,
        scope: "RESORT",
      });
      setDetails("");
      setAmount(0);
      setTried(false);
      setAdding(false);
      await day.refetch();
      // the day sheet's expense figure comes from the same entries
      await qc.invalidateQueries({ queryKey: ["day-sheet"] });
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That did not go through.");
    }
  });

  const header = <Stack.Screen options={{ title: "Expenses" }} />;

  if (resortId === undefined) {
    return (
      <>
        {header}
        <WhichResort what="the day's expenses" />
      </>
    );
  }

  if (day.error && !day.data) {
    return (
      <>
        {header}
        <Problem error={day.error} onRetry={() => void day.refetch()} />
      </>
    );
  }

  if (!day.data) {
    return (
      <>
        {header}
        <Loading what="the day's expenses" />
      </>
    );
  }

  const rows: ExpenseRow[] = day.data.rows ?? [];
  const total = day.data.summary?.amount ?? 0;
  const count = day.data.total ?? rows.length;

  return (
    <>
      {header}
      <Stale age={day.stale} />
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={day.isRefetching} onRefresh={() => void day.refetch()} />
        }
      >
        <DateNav value={date} onChange={setDate} timezone={activeResort?.timezone} />

        <View style={styles.figures}>
          <Stat label="Spent" value={whole(total)} tone={total > 0 ? "danger" : "title"} />
          <Stat label="Entries" value={String(count)} />
        </View>

        <Card
          title="The day"
          action={
            mayAdd ? (
              <Button
                label={adding ? "Close" : "Add"}
                kind="ghost"
                block={false}
                onPress={() => setAdding((open) => !open)}
              />
            ) : undefined
          }
        >
          {rows.length === 0 ? (
            <View style={styles.emptyBox}>
              <Empty
                message="Nothing spent on this day"
                hint={mayAdd ? "Add what went out and it appears here." : undefined}
              />
            </View>
          ) : (
            rows.map((row, i) => (
              <Row
                key={row.id}
                title={row.category}
                subtitle={row.details ?? undefined}
                meta={row.scope !== "RESORT" ? row.scope : undefined}
                last={i === rows.length - 1}
                accessibilityLabel={`${row.category}${row.details ? `, ${row.details}` : ""}, ${whole(row.amount)}`}
                right={
                  <Text step="body" weight="medium" tone="body" tabular>
                    {whole(row.amount)}
                  </Text>
                }
              />
            ))
          )}
        </Card>

        {adding && mayAdd ? (
          <Card title="What went out">
            <View style={styles.fields}>
              {categories.error && !categories.data ? (
                <Problem error={categories.error} onRetry={() => void categories.refetch()} />
              ) : !categories.data ? (
                <Loading what="the categories" />
              ) : choices.length === 0 ? (
                <Empty
                  message="No expense categories yet"
                  hint="The owner adds them in Settings → Lists; the API refuses one that is not on the list."
                />
              ) : (
                <View style={styles.kinds}>
                  {choices.map((option) => (
                    <Chip
                      key={option.code}
                      label={option.label}
                      on={category === option.code}
                      onPress={() => {
                        setCategory(option.code);
                        setTried(false);
                      }}
                    />
                  ))}
                </View>
              )}

              <Field label="Amount">
                <Input
                  value={amount ? String(amount) : ""}
                  onChangeText={(text) => {
                    const next = Number(text.replace(/[^0-9.]/g, "")) || 0;
                    setAmount(next);
                    if (next > 0) setTried(false);
                  }}
                  placeholder="0"
                  keyboardType="numeric"
                  invalid={tried && !(amount > 0)}
                />
              </Field>

              <Field label="What for" hint="Optional — but the one thing a reader wants next month">
                <Input value={details} onChangeText={setDetails} placeholder="Diesel for the generator" />
              </Field>

              {tried && incomplete ? (
                <Text step="small" tone="danger" weight="medium">
                  Pick a category and say how much.
                </Text>
              ) : null}

              {refused ? (
                <View style={styles.refused}>
                  <Text step="small" tone="danger" weight="medium">
                    {refused}
                  </Text>
                </View>
              ) : null}

              <Button label="Record it" loading={add.busy} onPress={add.go} />
            </View>
          </Card>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  figures: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  fields: { gap: space.md },
  kinds: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  emptyBox: { paddingVertical: space.lg },
  refused: {
    backgroundColor: color.danger.bg,
    borderWidth: 1,
    borderColor: color.danger.line,
    borderRadius: radius.md,
    padding: space.md,
  },
});
