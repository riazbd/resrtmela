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
import { formatMoney, type TodayRow } from "@rh/shared";
import { client, useAuth } from "../../src/api/session";
import { WhichResort } from "../../src/screens/which-resort";
import { useMoneyFormat } from "../../src/design/money";
import { Empty, Loading, Problem, Stale } from "../../src/design/states";
import { Card, Row, Stat } from "../../src/design/surface";
import { Text } from "../../src/design/text";
import { space } from "../../src/design/tokens";

/** A room list that reads, with the gaps an imported booking can leave. */
const roomsOf = (row: TodayRow) => row.rooms.filter(Boolean).join(", ") || "—";

export default function DashboardScreen() {
  const { activeResort } = useAuth();
  const resortId = activeResort?.id;
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
        <View style={styles.figures}>
          <Stat label="Occupancy" value={`${feed.occupancyPct}%`} sub="rooms checked in" />
          <Stat label="Arrivals" value={String(feed.arrivals.length)} sub="expected today" tone="ok" />
          <Stat label="Departures" value={String(feed.departures.length)} sub="due out today" />
          <Stat
            label="Outstanding dues"
            value={whole(feed.duesTotal)}
            sub={`${feed.duesCount} booking${feed.duesCount === 1 ? "" : "s"}`}
            tone={feed.duesTotal > 0 ? "danger" : "title"}
          />
        </View>

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
