/**
 * What the period came to.
 *
 * The console's reports page is 629 lines and eight tabs. This is not
 * that, and deliberately: the phone's job is the question an owner asks
 * standing somewhere other than their desk — *did we make money this
 * month* — with the two figures most often misread labelled so they
 * cannot be.
 *
 * `stillDue` is not income and `taxCollected` is not earnings. Both are
 * large, both look like revenue on a tile, and an owner who reads either
 * as profit has been misled by the screen rather than by the numbers.
 *
 * Everything else — the daily series, agents, sources, collectors, the
 * audit log — stays on the desk, where there is width for a table.
 */
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, router } from "expo-router";
import { keys, useApi } from "@rh/app-core";
import {
  addDaysIso,
  formatMoney,
  stayRange,
  todayIn,
  type ResortMetrics,
} from "@rh/shared";
import { client, useAuth } from "../../src/api/session";
import { Lenses } from "../../src/design/lenses";
import { useMoneyFormat } from "../../src/design/money";
import { Empty, Loading, Problem, Stale } from "../../src/design/states";
import { Card, Row, Stat } from "../../src/design/surface";
import { Text } from "../../src/design/text";
import { space } from "../../src/design/tokens";

/**
 * How far back to look. Named periods rather than a date picker, because
 * the question is almost always one of these three and a phone date
 * picker is three taps and a modal to answer it.
 */
const PERIODS = ["This month", "Last 90 days", "This year"] as const;
type Period = (typeof PERIODS)[number];

export function rangeFor(period: Period, today: string): { from: string; to: string } {
  const month = today.slice(0, 7);
  if (period === "This month") {
    return { from: `${month}-01`, to: addDaysIso(today, 1) };
  }
  if (period === "This year") {
    return { from: `${today.slice(0, 4)}-01-01`, to: addDaysIso(today, 1) };
  }
  // 90 days, counted back from tomorrow so today's takings are in it
  return { from: addDaysIso(today, -90), to: addDaysIso(today, 1) };
}

export default function ReportsScreen() {
  const { activeResort, can } = useAuth();
  const resortId = activeResort?.id;
  const money = useMoneyFormat();
  const whole = (n: number) => formatMoney(n, { ...money, decimals: 0 });

  const [period, setPeriod] = useState<Period>("This month");
  const today = todayIn(activeResort?.timezone);
  const range = rangeFor(period, today);

  const metrics = useApi<ResortMetrics>(
    keys.reports(resortId, "metrics", range),
    () => client.reports.metrics(resortId!, range),
    {
      enabled: resortId !== undefined,
      // the previous period's figures stay up while the next load, rather
      // than blanking a screen somebody is reading out
      placeholderData: (prev: ResortMetrics | undefined) => prev,
    },
  );

  const header = <Stack.Screen options={{ title: "Reports" }} />;

  if (resortId === undefined) {
    return (
      <>
        {header}
        <Empty message="No resort selected" hint="Choose a resort from the More tab." />
      </>
    );
  }

  if (metrics.error && !metrics.data) {
    return (
      <>
        {header}
        <Problem error={metrics.error} onRetry={() => void metrics.refetch()} />
      </>
    );
  }

  if (!metrics.data) {
    return (
      <>
        {header}
        <Loading what="the figures" />
      </>
    );
  }

  const m = metrics.data;

  return (
    <>
      {header}
      <Stale age={metrics.stale} />
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={
          <RefreshControl refreshing={metrics.isRefetching} onRefresh={() => void metrics.refetch()} />
        }
      >
        <Lenses options={PERIODS} value={period} onChange={setPeriod} />

        <View style={[styles.figures, metrics.isFetching ? styles.settling : null]}>
          <Stat
            label="Income"
            value={whole(m.grossIncome)}
            sub="received, net of tax"
            tone="ok"
          />
          <Stat label="Expenses" value={whole(m.expenses)} tone={m.expenses > 0 ? "danger" : "title"} />
          <Stat
            label="Net"
            value={whole(m.netProfit)}
            tone={m.netProfit < 0 ? "danger" : "ok"}
            sub="income less expenses"
          />
          <Stat label="Bookings" value={String(m.bookings)} sub="stays in the period" />
        </View>

        <Card title="Where it came from">
          <Row
            title="Rooms"
            meta={whole(m.netRoomRevenue)}
            accessibilityLabel={`Rooms billed: ${whole(m.netRoomRevenue)}`}
          />
          <Row
            title="Restaurant"
            meta={whole(m.restaurantRevenue)}
            accessibilityLabel={`Restaurant: ${whole(m.restaurantRevenue)}`}
          />
          <Row
            title="Discounts given"
            // no minus on nothing: "−৳0" reads as a mistake, and a period
            // where nobody discounted anything is the common case
            meta={m.discount > 0 ? `−${whole(m.discount)}` : whole(0)}
            last
            accessibilityLabel={`Discounts given: ${whole(m.discount)}`}
          />
        </Card>

        {/*
          The two figures most often read as profit, under a heading that
          says they are not. Both are large, both sit next to revenue on
          every other screen, and neither is the resort's money.
        */}
        <Card title="Not yours to spend">
          <Row
            title="Still due"
            subtitle="Billed for these stays and not yet paid"
            meta={whole(m.stillDue)}
            accessibilityLabel={`Still due, billed and not yet paid: ${whole(m.stillDue)}`}
          />
          <Row
            title="Tax collected"
            subtitle="Held for the government, inside what was received"
            meta={whole(m.taxCollected)}
            last
            accessibilityLabel={`Tax collected and held for the government: ${whole(m.taxCollected)}`}
          />
        </Card>

        <Card title="In more detail">
          {can("reports.pl") ? (
            <Row
              title="Profit and loss"
              subtitle="The resort and the restaurant, side by side"
              accessibilityLabel="Profit and loss"
              onPress={() =>
                router.push(`/reports/pl?from=${range.from}&to=${range.to}` as never)
              }
            />
          ) : null}
          <Row
            title="Who still owes"
            subtitle="Every unpaid stay, guest and agency"
            last
            accessibilityLabel="Who still owes"
            onPress={() => router.push("/payments" as never)}
          />
        </Card>

        {/* `to` is exclusive — the API takes `lt` — so the last day a
            person reads is the day before it */}
        <Text step="caption" tone="muted" style={styles.footnote}>
          {stayRange(range.from, addDaysIso(range.to, -1))}
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  figures: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  settling: { opacity: 0.5 },
  footnote: { textAlign: "center" },
});
