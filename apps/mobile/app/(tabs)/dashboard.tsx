/**
 * The day, in one screen.
 *
 * One request. `today` already answers occupancy, both lists and what is
 * owed, computed with the resort's tax rules — which never reach the phone.
 * A screen that added `due` up across the rows would be a second
 * implementation of the bill, and the first time the two disagreed nobody
 * would know which was lying.
 *
 * The figures are whole taka. Paisa on a dashboard are noise; the stay bill
 * is where they matter and the stay bill shows them.
 */
import { useCallback } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { keys, useApi } from "@rh/app-core";
import { addDaysIso, dayLabel, formatMoney, todayIn, type DailyRevenueRow, type TodayRow } from "@rh/shared";
import { client, useAuth } from "../../src/api/session";
import { WhichResort } from "../../src/screens/which-resort";
import { useMoneyFormat } from "../../src/design/money";
import { Empty, Loading, Problem, Stale } from "../../src/design/states";
import { Card, Row } from "../../src/design/surface";
import { Columns, Legend, SplitBar } from "../../src/design/charts";
import { Hero, HeroFigure, greetingAt } from "../../src/design/hero";
import { Text } from "../../src/design/text";
import { color, space } from "../../src/design/tokens";

/** A room list that reads, with the gaps an imported booking can leave. */
const roomsOf = (row: TodayRow) => row.rooms.filter(Boolean).join(", ") || "—";

export default function DashboardScreen() {
  const { activeResort, can, me } = useAuth();
  const resortId = activeResort?.id;
  const today = todayIn(activeResort?.timezone);
  const twoWeeksAgo = addDaysIso(today, -13);
  // the resort's hour, so the greeting is the resort's morning
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: activeResort?.timezone ?? "Asia/Dhaka" }).format(new Date()),
  );
  // the last two weeks as a picture — the same daily report the console
  // draws, for whoever may read reports
  const trend = useApi<DailyRevenueRow[]>(
    keys.reports(resortId, "daily", `${twoWeeksAgo}:${today}`),
    () => client.reports.daily(resortId!, twoWeeksAgo, addDaysIso(today, 1)),
    { enabled: resortId !== undefined && can("reports.view") },
  );
  const money = useMoneyFormat();
  /** Whole taka, and the same call the `Money` component would make. */
  const whole = useCallback(
    (amount: number) => formatMoney(amount, { ...money, decimals: 0 }),
    [money],
  );

  const day = useApi(keys.today(resortId), () => client.today(resortId!), {
    enabled: resortId !== undefined,
  });

  /**
   * Phase 0 wrote this as "not a spinner", and the reasoning was sound as
   * far as it went: a tab can be opened before the session has settled on
   * a resort, and somebody watching a spinner that will never stop has no
   * way to know that is what is happening.
   *
   * The answer was the wrong half of the choice. `WhichResort` spins only
   * while `loading` is true — a flag that does turn false — and says the
   * sentence once there is nothing left to wait for. Found on a device,
   * where restoring takes seconds and every screen was telling people to
   * go and fix something that was not broken.
   */
  if (resortId === undefined) return <WhichResort what="today" />;

  if (day.error && !day.data) return <Problem error={day.error} onRetry={() => void day.refetch()} />;
  if (!day.data) return <Loading what="today" />;

  const feed = day.data;

  return (
    <>
      <Stale age={day.stale} />
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={
          <RefreshControl refreshing={day.isRefetching} onRefresh={() => void day.refetch()} />
        }
      >
        <Hero
          title={`${greetingAt(hour)}, ${(me?.name ?? "").split(" ")[0] || "there"}`}
          subtitle={`${activeResort?.name ?? ""} · ${dayLabel(today)}`}
        >
          <HeroFigure label="Occupancy" value={`${feed.occupancyPct}%`} sub="rooms checked in" />
          <HeroFigure label="Arrivals" value={String(feed.arrivals.length)} sub="expected today" />
          <HeroFigure label="Departures" value={String(feed.departures.length)} sub="due out today" />
          {/*
            "Outstanding dues" until 2026-09-21, which is the resort's
            whole ledger and belongs to the Dues screen. This counts only
            the people arriving today, so a resort owed one and a half
            lakh read ৳0 here while Dues, one tap away, read ৳1,59,000.
            The figure was right and the word was not.
          */}
          <HeroFigure
            label="To collect today"
            value={whole(feed.arrivalsDueTotal)}
            sub={
              /*
                `> 0`, not `=== 0`: an app whose API has not caught up with
                it yet reads `undefined` here, and "from undefined arrivals"
                is what the phone printed for a full minute after this field
                was renamed. The two deploy separately, so that minute can
                happen to anybody.
              */
              feed.arrivalsDueCount > 0
                ? `from ${feed.arrivalsDueCount} arrival${feed.arrivalsDueCount === 1 ? "" : "s"}`
                : "nothing to collect"
            }
          />
        </Hero>

        <Card title="Tonight">
          <SplitBar
            format={(n) => `${Math.round(n)}%`}
            total={100}
            parts={[
              { label: "Occupied", value: feed.occupancyPct, color: color.chart.money.paid.solid },
              { label: "Free", value: Math.max(0, 100 - feed.occupancyPct), color: color.ink[200] },
            ]}
          />
        </Card>

        {trend.data && trend.data.length > 0 ? (
          <Card title="The last two weeks">
            <Columns
              height={130}
              formatFull={whole}
              series={[
                { key: "rooms", label: "Rooms", color: color.chart.money.paid.solid },
                { key: "fb", label: "Restaurant", color: color.chart.money.advance.solid },
              ]}
              marker={{ key: "expenses", label: "Spent", color: color.chart.money.expense.solid }}
              data={trend.data.map((d, i, all) => ({
                label: i % 3 === 0 || i === all.length - 1 ? String(Number(d.date.slice(8, 10))) : "",
                title: dayLabel(d.date),
                values: { rooms: d.roomRevenue, fb: d.fbRevenue, expenses: d.expenses },
              }))}
            />
            <Legend
              items={[
                { label: "Rooms", color: color.chart.money.paid.solid },
                { label: "Restaurant", color: color.chart.money.advance.solid },
                { label: "Spent", color: color.chart.money.expense.solid },
              ]}
            />
          </Card>
        ) : null}

        <Card title="Arrivals">
          <StayList rows={feed.arrivals} empty="No arrivals today" whole={whole} />
        </Card>

        <Card title="Departures">
          <StayList rows={feed.departures} empty="No departures today" whole={whole} />
        </Card>
      </ScrollView>
    </>
  );
}

function StayList({
  rows,
  empty,
  whole,
}: {
  rows: TodayRow[];
  empty: string;
  whole: (amount: number) => string;
}) {
  if (rows.length === 0) {
    return (
      <View style={styles.emptyBox}>
        <Empty message={empty} />
      </View>
    );
  }
  return (
    <>
      {rows.map((row, i) => {
        // an imported booking can have no guest at all, and a screen that
        // reaches for `.fullName` here is how one booking took a whole page
        // down in the console
        const who = row.guest?.fullName ?? "—";
        const where = roomsOf(row);
        return (
          <Row
            key={row.id}
            title={who}
            subtitle={where}
            meta={row.code}
            last={i === rows.length - 1}
            accessibilityLabel={`${who}, ${where}, ${whole(row.due)} due`}
            onPress={() => router.push(`/bookings/${row.id}` as never)}
            right={
              <Text step="body" weight="medium" tone={row.due > 0 ? "danger" : "muted"} tabular>
                {whole(row.due)}
              </Text>
            }
          />
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  figures: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  middle: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space.xl,
    gap: space.sm,
  },
  centred: { textAlign: "center" },
  // the shared Empty fills its parent; inside a card it needs a height of its
  // own or it collapses to nothing
  emptyBox: { paddingVertical: space.lg },
});
