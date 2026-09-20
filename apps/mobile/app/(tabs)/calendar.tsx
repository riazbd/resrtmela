/**
 * The month, as a chart of stays — on a screen four inches wide.
 *
 * The console draws thirty columns at once. A phone cannot, so the days
 * scroll sideways under a pinned column of room names, and a stay is one bar
 * across the nights it holds rather than a square per night. That was worth
 * doing on the desktop too: a three-night booking used to be three
 * disconnected blocks with the guest's name crammed into each at 9px.
 *
 * The rule the colours obey is `@rh/shared`'s and not this screen's:
 *
 *   - green is free, and nothing else is green;
 *   - red is held, and the shade says how firmly;
 *   - grey is a guest who has gone, because that night is sellable again.
 *
 * And a stay holds up to but **not including** check-out. Checkout morning
 * is a night the resort can sell that evening, and a calendar that paints it
 * red turns guests away from an empty room.
 */
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, router } from "expo-router";
import { keys, useApi } from "@rh/app-core";
import {
  NIGHT_MEANING,
  addDaysIso,
  dayLabel,
  isHeldState,
  isWeekend,
  mergeRuns,
  monthGrid,
  monthLength,
  monthOf,
  monthStart,
  nightLoad,
  nightsHeld,
  occupancyOf,
  todayIn,
  type CalendarBooking,
  type NightLoadState,
  type Room,
} from "@rh/shared";
import { client, useAuth } from "../../src/api/session";
import { DateNav } from "../../src/design/date-nav";
import { Lenses } from "../../src/design/lenses";
import { Empty, Loading, Problem, Stale } from "../../src/design/states";
import { Text } from "../../src/design/text";
import { TOUCH_TARGET, color, radius, space } from "../../src/design/tokens";

/** A month at a time, which is what a resort's calendar is mostly asked. */
const SPAN = 30;

/**
 * Two questions, one screen — as the console has it.
 *
 * *Rooms* answers "who is in 103 on the 14th". *Month* answers "can I take a
 * booking for the 22nd", which is asked far more often and which the room
 * grid makes you count columns for.
 */
const VIEWS = ["Rooms", "Month"] as const;
// `CalendarView`, not `View`: react-native already owns that name here
type CalendarView = (typeof VIEWS)[number];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** A night's state, in this app's tokens. The rule itself is `nightLoad`. */
const LOAD_LOOK: Record<
  NightLoadState,
  { bg: string; line: string; tone: "ok" | "warn" | "danger" | "muted" }
> = {
  free: { bg: color.ok.bg, line: color.ok.line, tone: "ok" },
  tight: { bg: color.warn.bg, line: color.warn.line, tone: "warn" },
  full: { bg: color.danger.bg, line: color.danger.line, tone: "danger" },
  none: { bg: color.surface, line: color.line, tone: "muted" },
};

/** Wide enough for a date above it and a thumb on it. */
const DAY_WIDTH = 44;
const NAME_WIDTH = 104;
const ROW_HEIGHT = TOUCH_TARGET;

/**
 * Red, by how firmly the night is held — the console's own ramp, in this
 * app's tokens. Departed is grey, and free is green, and neither is here
 * because neither is a held night.
 */
const HELD_FILL: Record<1 | 2 | 3, string> = {
  1: color.danger.bg,
  2: color.danger.line,
  3: color.danger.fg,
};

export default function CalendarScreen() {
  const { activeResort } = useAuth();
  const resortId = activeResort?.id;

  /**
   * Opened on the resort's day, and kept there until somebody moves it.
   * `useState(todayIn(...))` reads correctly and is wrong: it runs before the
   * session has settled, when the zone is still unknown — the day sheet
   * shipped that bug for an afternoon.
   */
  const [chosen, setStart] = useState<string | null>(null);
  const [view, setView] = useState<CalendarView>("Rooms");
  const today = todayIn(activeResort?.timezone);
  const anchor = chosen ?? today;

  /**
   * The window follows the lens.
   *
   * The room grid reads thirty days from wherever you are. The month grid
   * draws a calendar month, and asking for thirty days from the 20th would
   * leave the first nineteen squares with no data — which the grid would
   * then cheerfully draw as "3 left" on nights that are sold out.
   */
  const month = monthOf(anchor);
  const start = view === "Month" ? (monthStart(month) ?? anchor) : anchor;
  const span = view === "Month" ? monthLength(month) : SPAN;
  const end = addDaysIso(start, span);

  const days = useMemo(
    () => Array.from({ length: span }, (_, i) => addDaysIso(start, i)),
    [start, span],
  );

  // the room list is the one every other screen reads, under one cache key;
  // paging the calendar only refetches the bookings
  const roomsQ = useApi(keys.rooms(resortId), () => client.rooms.list(resortId!), {
    enabled: resortId !== undefined,
  });
  const calQ = useApi(
    keys.calendar(resortId, start, end),
    () => client.calendar(resortId!, start, end),
    { enabled: resortId !== undefined, placeholderData: (prev) => prev },
  );

  const all = useMemo(() => roomsQ.data ?? [], [roomsQ.data]);
  const sellable = useMemo(() => all.filter((r) => r.status === "ACTIVE"), [all]);
  /**
   * What can be sold first; the rest sink to the bottom, still visible. A
   * desk reads this screen for tonight, and a maintenance room interleaved
   * between two sellable ones is a row of hatching in the way of the answer.
   */
  const rooms = useMemo(
    () => [...sellable, ...all.filter((r) => r.status !== "ACTIVE")],
    [all, sellable],
  );

  const bookings: CalendarBooking[] = useMemo(() => calQ.data?.bookings ?? [], [calQ.data]);
  const held = useMemo(() => nightsHeld(bookings, days), [bookings, days]);
  const occupancy = useMemo(
    () => occupancyOf(days, sellable.map((r) => r.id), held),
    [days, sellable, held],
  );

  const header = <Stack.Screen options={{ title: "Calendar" }} />;
  const error = calQ.error ?? roomsQ.error;

  if (resortId === undefined) {
    return (
      <>
        {header}
        <Empty
          message="No resort selected"
          hint="Choose a resort from the More tab, or ask the owner to add you to one."
        />
      </>
    );
  }
  if (error && !calQ.data) {
    return (
      <>
        {header}
        <Problem
          error={error}
          onRetry={() => {
            void calQ.refetch();
            void roomsQ.refetch();
          }}
        />
      </>
    );
  }
  if (!calQ.data || !roomsQ.data) {
    return (
      <>
        {header}
        <Loading what="the calendar" />
      </>
    );
  }

  if (rooms.length === 0) {
    return (
      <>
        {header}
        <Empty message="No rooms yet" hint="Add the resort's rooms and the month fills itself." />
      </>
    );
  }

  return (
    <>
      {header}
      <Stale age={calQ.stale} />
      <View style={styles.nav}>
        {/*
          The day arrows belong to the room grid, which can start anywhere.
          In the month lens the window is a calendar month, so a control that
          says "Tuesday, 1 September — Back to today" is describing the edge
          of the window rather than where the reader is. The month range and
          its own arrows say that better, and say it once.
        */}
        {view === "Rooms" ? (
          <DateNav value={start} onChange={setStart} timezone={activeResort?.timezone} />
        ) : null}
        <View style={styles.months}>
          <MonthStep label="Previous month" onPress={() => setStart(addDaysIso(start, -span))} />
          <Text step="caption" tone="muted">
            {dayLabel(start)} — {dayLabel(addDaysIso(start, span - 1))}
          </Text>
          <MonthStep label="Next month" onPress={() => setStart(addDaysIso(start, span))} />
        </View>
        <Lenses options={VIEWS} value={view} onChange={setView} />
      </View>

      {/*
        The names stay put and the days scroll under them. Two columns rather
        than one scroller: a grid whose row labels slide off the left is a
        grid where the fifth room down is anonymous by the time you have
        scrolled to next week.
      */}
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={calQ.isRefetching} onRefresh={() => void calQ.refetch()} />
        }
      >
        {view === "Month" ? (
          <MonthOfNights
            month={month}
            today={today}
            sellable={sellable.length}
            occupancy={occupancy}
          />
        ) : (
        <View style={styles.sheet}>
          <View>
            <View style={[styles.name, styles.head]} />
            {rooms.map((room) => (
              <RoomName key={room.id} room={room} />
            ))}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View>
              <DayHeads days={days} occupancy={occupancy} sellable={sellable.length} />
              {rooms.map((room) => (
                <RoomNights key={room.id} room={room} days={days} held={held} />
              ))}
            </View>
          </ScrollView>
        </View>
        )}
      </ScrollView>
    </>
  );
}

/**
 * The month, as squares: which nights are gone, and how nearly.
 *
 * The past is dimmed rather than dropped. A month missing its first
 * fortnight is hard to read as a month, and last week's occupancy is exactly
 * what somebody reviewing the month came to see.
 */
function MonthOfNights({
  month,
  today,
  sellable,
  occupancy,
}: {
  month: string;
  today: string;
  sellable: number;
  occupancy: { day: string; taken: number }[];
}) {
  const takenOn = new Map(occupancy.map((o) => [o.day, o.taken]));
  const weeks = monthGrid(month);

  return (
    <View style={styles.month}>
      <View style={styles.week}>
        {WEEKDAYS.map((name, i) => (
          <Text
            key={name}
            step="caption"
            weight="medium"
            // the last two columns are the weekend here: Bangladesh's week
            // runs Sunday to Thursday
            tone={i >= 5 ? "warn" : "muted"}
            style={styles.weekday}
          >
            {name}
          </Text>
        ))}
      </View>

      {weeks.map((week, w) => (
        <View key={w} style={styles.week}>
          {week.map((day, d) => {
            if (!day) return <View key={`pad-${w}-${d}`} style={styles.square} />;
            const load = nightLoad(takenOn.get(day) ?? 0, sellable);
            const look = LOAD_LOOK[load.state];
            const past = day < today;
            const spoken = dayLabel(day);
            return (
              <Pressable
                key={day}
                accessibilityRole="button"
                accessibilityLabel={`${spoken}, ${
                  load.state === "full" ? "full" : `${load.left} left of ${sellable}`
                }`}
                onPress={() => router.push(`/daysheet?date=${day}` as never)}
                style={({ pressed }) => [
                  styles.square,
                  styles.night,
                  { backgroundColor: look.bg, borderColor: look.line },
                  day === today ? styles.todayRing : null,
                  past ? styles.past : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text step="strong" weight="bold" tone={look.tone} tabular>
                  {Number(day.slice(8, 10))}
                </Text>
                <Text step="caption" tone={look.tone} numberOfLines={1}>
                  {load.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function MonthStep({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.monthStep, pressed ? styles.pressed : null]}
    >
      <Text step="caption" weight="medium" tone="body">
        {label === "Next month" ? "Next ›" : "‹ Prev"}
      </Text>
    </Pressable>
  );
}

function DayHeads({
  days,
  occupancy,
  sellable,
}: {
  days: string[];
  occupancy: { day: string; taken: number }[];
  sellable: number;
}) {
  const takenOn = new Map(occupancy.map((o) => [o.day, o.taken]));
  return (
    <View style={styles.row}>
      {days.map((day) => {
        const taken = takenOn.get(day) ?? 0;
        return (
          <View
            key={day}
            accessible
            accessibilityLabel={`${dayLabel(day)}: ${taken} of ${sellable} rooms taken`}
            style={[styles.dayHead, isWeekend(day) ? styles.weekend : null]}
          >
            <Text step="caption" tone="muted">
              {day.slice(8, 10)}
            </Text>
            <Text step="caption" weight="medium" tone={taken >= sellable && sellable > 0 ? "danger" : "muted"} tabular>
              {taken}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function RoomName({ room }: { room: Room }) {
  const outOfService = room.status !== "ACTIVE";
  return (
    <View
      style={[styles.name, outOfService ? styles.nameOff : null]}
      accessible
      accessibilityLabel={`Room ${room.name}${outOfService ? ", out of service" : ""}`}
    >
      <Text step="small" weight="medium" tone={outOfService ? "muted" : "title"} numberOfLines={1}>
        {room.name}
      </Text>
    </View>
  );
}

function RoomNights({
  room,
  days,
  held,
}: {
  room: Room;
  days: string[];
  held: Map<string, CalendarBooking>;
}) {
  const outOfService = room.status !== "ACTIVE";
  const runs = mergeRuns(
    days,
    (day) => held.get(`${room.id}|${day}`) ?? null,
    (booking) => booking.id,
  );

  return (
    <View style={styles.row}>
      {runs.map((run) => {
        const width = run.nights * DAY_WIDTH;
        if (!run.value) {
          return (
            <View
              key={run.from}
              style={[styles.cell, styles.free, outOfService ? styles.offService : null, { width }]}
            />
          );
        }
        const booking = run.value;
        const meaning = isHeldState(booking.state) ? NIGHT_MEANING[booking.state] : null;
        const who = booking.guestName || booking.agentName || booking.code;
        return (
          <Pressable
            key={run.from}
            accessibilityRole="button"
            accessibilityLabel={`${who}, ${meaning?.label ?? booking.state}, ${dayLabel(run.from)} for ${run.nights} night${run.nights === 1 ? "" : "s"}, ${room.name}`}
            onPress={() => router.push(`/bookings/${booking.id}` as never)}
            style={[
              styles.cell,
              {
                width,
                backgroundColor: meaning?.gone
                  ? color.ink[200]
                  : HELD_FILL[meaning?.firmness ?? 2],
              },
            ]}
          >
            <Text
              step="caption"
              weight="medium"
              numberOfLines={1}
              // the deepest red needs light text on it; the two paler ones do not
              tone={meaning && !meaning.gone && meaning.firmness === 3 ? "onBrand" : "body"}
            >
              {who}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { padding: space.lg, gap: space.sm, backgroundColor: color.screen },
  months: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  monthStep: {
    minHeight: TOUCH_TARGET - space.md,
    justifyContent: "center",
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  sheet: { flexDirection: "row", paddingBottom: space.xl },
  month: { padding: space.lg, gap: space.sm },
  week: { flexDirection: "row", gap: space.xs },
  weekday: { flex: 1, textAlign: "center" },
  square: { flex: 1, aspectRatio: 0.82 },
  night: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  todayRing: { borderColor: color.brand[600], borderWidth: 2 },
  /** Dimmed, not dropped. */
  past: { opacity: 0.45 },
  row: { flexDirection: "row", alignItems: "stretch" },
  name: {
    width: NAME_WIDTH,
    height: ROW_HEIGHT,
    justifyContent: "center",
    paddingHorizontal: space.sm,
    borderRightWidth: 1,
    borderRightColor: color.line,
    borderBottomWidth: 1,
    borderBottomColor: color.line,
    backgroundColor: color.surface,
  },
  nameOff: { backgroundColor: color.ink[100] },
  head: { height: ROW_HEIGHT },
  dayHead: {
    width: DAY_WIDTH,
    height: ROW_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: color.line,
    borderBottomWidth: 1,
    borderBottomColor: color.line,
    backgroundColor: color.surface,
  },
  weekend: { backgroundColor: color.ink[100] },
  cell: {
    height: ROW_HEIGHT,
    justifyContent: "center",
    paddingHorizontal: space.xs,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: color.surface,
    borderBottomWidth: 1,
    borderBottomColor: color.line,
    borderRadius: radius.sm,
  },
  /** Green is free, and nothing else on this grid is green. */
  free: { backgroundColor: color.ok.bg },
  offService: { backgroundColor: color.ink[100] },
  pressed: { backgroundColor: color.ink[100] },
});
