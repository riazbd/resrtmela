/**
 * The day sheet: every room, and what is in it tonight.
 *
 * The screen a front desk leaves open all morning. The console draws it as a
 * five-column table; a phone has room for one row per room, so the three
 * things a clerk is actually looking for — is it free, who is in it, what do
 * they owe — sit on that row and nothing else does.
 *
 * The order is the server's. These rooms came back in creation order until
 * 2026-09-20, which is how `3 Orchid` sat above `1 Camellia` on the demo
 * resort's first afternoon. The API sorts them now, and this screen must not
 * undo that by sorting again on its own idea of order.
 */
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { keys, useApi } from "@rh/app-core";
import { addDaysIso, formatMoney, lastNightLabel, todayIn, type DaySheetRoom } from "@rh/shared";
import { client, useAuth } from "../../../src/api/session";
import { WhichResort } from "../../../src/screens/which-resort";
import { DateNav } from "../../../src/design/date-nav";
import { useMoneyFormat } from "../../../src/design/money";
import { Empty, Loading, Problem, Stale } from "../../../src/design/states";
import { Card, Row, Stat } from "../../../src/design/surface";
import { Text } from "../../../src/design/text";
import { color, radius, space } from "../../../src/design/tokens";

/** The three things a room can be tonight, in the words a clerk uses. */
function saying(room: DaySheetRoom): string {
  if (room.cell.mode === "oos") return "Out of service";
  if (room.cell.mode === "available") return "Free";
  return room.cell.guestName ?? "—";
}

export default function DaySheetScreen() {
  const { activeResort } = useAuth();
  const resortId = activeResort?.id;
  const money = useMoneyFormat();
  const whole = useCallback(
    (amount: number) => formatMoney(amount, { ...money, decimals: 0 }),
    [money],
  );

  /**
   * Opened on the resort's day — and *kept* on it until somebody chooses
   * otherwise, which is the part that took a second try.
   *
   * `useState(() => todayIn(activeResort?.timezone))` reads correctly and is
   * wrong: the initialiser runs on the first render, before the session has
   * finished restoring, when `activeResort` is still null. The fallback zone
   * is UTC, so the register opened on yesterday and nothing corrected it when
   * the resort arrived a render later. Found by opening the screen at 23:56
   * UTC, where it said "Saturday, 19 September" over a resort for which it
   * was already the 20th.
   *
   * So nothing is remembered until a choice is made: `null` means today, and
   * today is recomputed from whatever the session now knows.
   */
  const [chosen, setDate] = useState<string | null>(null);
  /**
   * A day somebody was sent to — the month view taps a night and lands here.
   * It is the starting point, not a lock: the arrows still move from it.
   */
  const { date: asked } = useLocalSearchParams<{ date?: string }>();
  const sentTo = typeof asked === "string" && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : null;
  const date = chosen ?? sentTo ?? todayIn(activeResort?.timezone);

  const sheet = useApi(
    keys.daySheet(resortId, date),
    () => client.daySheet(resortId!, date),
    { enabled: resortId !== undefined },
  );

  const header = <Stack.Screen options={{ title: "Day sheet" }} />;

  if (resortId === undefined) {
    return (
      <>
        {header}
        <WhichResort what="the day sheet" />
      </>
    );
  }

  if (sheet.error && !sheet.data) {
    return (
      <>
        {header}
        <Problem error={sheet.error} onRetry={() => void sheet.refetch()} />
      </>
    );
  }

  if (!sheet.data) {
    return (
      <>
        {header}
        <Loading what="the day sheet" />
      </>
    );
  }

  const { rooms, strip } = sheet.data;

  return (
    <>
      {header}
      <Stale age={sheet.stale} />
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={
          <RefreshControl refreshing={sheet.isRefetching} onRefresh={() => void sheet.refetch()} />
        }
      >
        <DateNav value={date} onChange={setDate} timezone={activeResort?.timezone} />

        <View style={styles.figures}>
          <Stat
            label="Balance due"
            value={whole(strip.balanceDue)}
            tone={strip.balanceDue > 0 ? "danger" : "title"}
          />
          <Stat label="Night revenue" value={whole(strip.revenue)} tone="ok" />
          <Stat label="Expenses" value={whole(strip.expenses)} />
          <Stat label="Occupancy" value={`${strip.occupancy}/${strip.totalRooms}`} sub="rooms taken" />
          {/*
            "Departures" here would be the same lie the room chips told.
            The strip counts first nights and last nights of the night on
            screen, so the second figure is people whose stay ends the
            next morning — which is why the dashboard, which counts
            check-outs dated today, can honestly say none while this says
            three.
          */}
          <Stat
            label="Arrivals / last nights"
            value={`${strip.arrivals} / ${strip.departures}`}
            sub="in tonight / out tomorrow"
          />
        </View>

        <Card title="Rooms">
          {rooms.length === 0 ? (
            <View style={styles.emptyBox}>
              <Empty
                message="No rooms yet"
                hint="Add the resort's rooms and the register fills itself."
              />
            </View>
          ) : (
            rooms.map((room, i) => (
              <RoomRow
                key={room.roomId}
                room={room}
                date={date}
                last={i === rooms.length - 1}
                whole={whole}
              />
            ))
          )}
        </Card>
      </ScrollView>
    </>
  );
}

function RoomRow({
  room,
  date,
  last,
  whole,
}: {
  room: DaySheetRoom;
  /** The night on screen — what a new booking here would be for. */
  date: string;
  last: boolean;
  whole: (amount: number) => string;
}) {
  const cell = room.cell;
  const booked = cell.mode === "booked";
  const owes = cell.due ?? null;

  /**
   * Two of the three states go somewhere.
   *
   * A taken room opens its booking. A free one starts a booking for that
   * room on that night — the clerk with somebody at the counter has
   * already decided both, and making them open a blank form and choose
   * again is the work this screen exists to save. A room out of service is
   * inert, because there is nothing to do with it from here.
   */
  const go =
    booked && cell.bookingId
      ? () => router.push(`/bookings/${cell.bookingId}` as never)
      : cell.mode === "available"
        ? () => router.push(`/new-booking?roomId=${room.roomId}&checkIn=${date}` as never)
        : undefined;

  /**
   * The whole row as one sentence. A register announced field by field —
   * "4 Palash", "Tanvir Islam", "27,000" — makes a screen reader user
   * reassemble what a sighted clerk reads in one glance.
   */
  const spoken = booked
    ? `Room ${room.name}, ${cell.guestName ?? "no guest"}${owes !== null ? `, ${whole(owes)} due` : ""}`
    : `Room ${room.name}, ${cell.mode === "oos" ? "out of service" : "free"}`;

  return (
    <Row
      title={room.name}
      subtitle={saying(room)}
      meta={booked ? cell.code : `${room.capacity ?? "—"} pax`}
      last={last}
      accessibilityLabel={spoken}
      onPress={go}
      right={
        <View style={styles.right}>
          {cell.arrives ? <Tag text="Arrives" tone="ok" /> : null}
          {/*
            Not "Departs" and certainly not "Departs today": this is a
            register of nights, and the last cell of a stay is the night
            before they go. The chip names that morning, because a room
            read as free this afternoon gets sold twice.
          */}
          {cell.departs ? (
            <Tag text={lastNightLabel(addDaysIso(date, 1), date) ?? "Last night"} tone="warn" />
          ) : null}
          {owes !== null ? (
            <Text step="body" weight="medium" tone={owes > 0 ? "danger" : "muted"} tabular>
              {whole(owes)}
            </Text>
          ) : null}
        </View>
      }
    />
  );
}

function Tag({ text, tone }: { text: string; tone: "ok" | "warn" }) {
  return (
    <View style={[styles.tag, { backgroundColor: color[tone].bg, borderColor: color[tone].line }]}>
      <Text step="caption" weight="medium" tone={tone}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  figures: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  right: { flexDirection: "row", alignItems: "center", gap: space.sm },
  tag: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  emptyBox: { paddingVertical: space.lg },
});
