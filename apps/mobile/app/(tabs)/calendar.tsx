/**
 * The calendar, on a screen four inches wide.
 *
 * The console draws thirty columns at once. A phone cannot, and the
 * first attempt at this pretended otherwise: thirty 44-pixel columns
 * scrolling sideways under a pinned column of room names. The owner
 * looked at it and asked why it was full of `…`, which it was — a
 * one-night stay got 36 usable pixels and no name fits in that, so the
 * grid drew an ellipsis and nothing else.
 *
 * It is a week now, seven nights across the full width, with the room's
 * name on its own line above its strip. Nothing scrolls sideways,
 * nothing is truncated, and a bar too narrow to hold a name does not
 * try — see `room-week.tsx`.
 *
 * Both lenses move by month from a picker rather than by `‹ ›` alone.
 * Six presses to reach March was the other half of what the owner
 * asked about.
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
  monthGrid,
  monthLength,
  monthOf,
  monthStart,
  nightLoad,
  nightsHeld,
  occupancyOf,
  stepMonth,
  todayIn,
  type CalendarBooking,
  type NightLoadState,
} from "@rh/shared";
import { client, useAuth } from "../../src/api/session";
import { WhichResort } from "../../src/screens/which-resort";
import { MonthBar } from "../../src/design/month-bar";
import { Lenses } from "../../src/design/lenses";
import { Empty, Loading, Problem, Stale } from "../../src/design/states";
import { Text } from "../../src/design/text";
import { RoomWeek, WeekHead, WEEK } from "../../src/screens/room-week";
import { TOUCH_TARGET, color, radius, space } from "../../src/design/tokens";

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
   * Rooms reads a week from wherever you are. Month draws a calendar
   * month — asking for a week from the 20th would leave nineteen
   * squares with no data, which the grid would cheerfully draw as
   * "3 left" on nights that are sold out.
   */
  const month = monthOf(anchor);
  const start = view === "Month" ? (monthStart(month) ?? anchor) : anchor;
  const span = view === "Month" ? monthLength(month) : WEEK;
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

  /**
   * No `title` here. A tab is named by the bar, which runs the
   * console's label through `barLabel` so it fits; a title set on the
   * screen overrides that from underneath and the bar goes back to
   * an ellipsis. `a-tab-does-not-name-itself.spec.ts` is the rule.
   */
  const header = null;
  const error = calQ.error ?? roomsQ.error;

  if (resortId === undefined) {
    return (
      <>
        {header}
        <WhichResort what="the calendar" />
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
          One row, and it does both jobs.

          The arrows step whatever the lens is showing — a week in
          Rooms, a month in Month — and the label between them opens a
          year and twelve months, which is the part that was missing:
          March used to be six presses away and last season was
          unreachable in practice.

          It was two rows for an hour, a month bar above a week bar,
          and between them and the lens toggle the controls took two
          fifths of the screen before a single room appeared.

          Picking a month lands on its first day; in Rooms that is the
          week the month opens with.
        */}
        <MonthBar
          month={month}
          today={today}
          onChange={(m) => setStart(monthStart(m) ?? today)}
          label={
            view === "Rooms"
              ? `${dayLabel(start)} — ${dayLabel(addDaysIso(start, WEEK - 1))}`
              : undefined
          }
          onStep={view === "Rooms" ? (by) => setStart(addDaysIso(start, by * WEEK)) : undefined}
          stepLabels={
            view === "Rooms"
              ? { back: "Previous week", forward: "Next week" }
              : { back: "Previous month", forward: "Next month" }
          }
        />

        <Lenses options={VIEWS} value={view} onChange={setView} />
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={calQ.isRefetching} onRefresh={() => void calQ.refetch()} />
        }
      >
        {view === "Month" ? (
          <>
            <MonthOfNights
              month={month}
              today={today}
              sellable={sellable.length}
              occupancy={occupancy}
            />
            {/*
              Under the grid rather than over it: the squares are what
              somebody came for, and a summary above them would push the
              first week off a short screen. It also fills what was six
              hundred pixels of nothing — a month has four or five rows
              and the screen has room for eight.
            */}
            <MonthTotals days={days} sellable={sellable.length} occupancy={occupancy} />
          </>
        ) : (
          <View style={styles.sheet}>
            <WeekHead
              days={days}
              taken={new Map(occupancy.map((o) => [o.day, o.taken]))}
              sellable={sellable.length}
              today={today}
            />
            {rooms.map((room) => (
              <RoomWeek
                key={room.id}
                room={room}
                days={days}
                held={held}
                onOpenBooking={(id) => router.push(`/bookings/${id}` as never)}
                /*
                 * A free night is where a booking starts. Somebody who
                 * has just found a gap is about to fill it, and making
                 * them go to another screen and re-enter the room and
                 * the date is the kind of small tax that stops a tool
                 * being used at the desk.
                 */
                onTakeNight={(roomId, day) =>
                  router.push(`/new-booking?roomId=${roomId}&checkIn=${day}` as never)
                }
              />
            ))}
          </View>
        )}

        {/*
          What the colours mean.

          Four fills and a grey, and until 2026-09-21 nothing on the screen
          said which was which — a reader had to tap a bar to find out
          whether the pale one was a held night or a paid one. Seen on a
          phone; no test can notice a missing sentence.
        */}
        {view === "Rooms" ? <NightKey /> : null}
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

/**
 * The key to the grid above it.
 *
 * Read off `NIGHT_MEANING` rather than written out, so a state that
 * changes firmness changes its swatch too. "Free" and "Out of service"
 * are not held states and are named here because the grid draws them.
 */
/**
 * What the month came to.
 *
 * The grid says which nights are gone; this says how the month did,
 * which is the question an owner opens a month to ask and which
 * counting thirty squares by eye does not answer.
 *
 * Room-nights rather than bookings: a resort with ten rooms has three
 * hundred of them in September, and "186 of 300" is a sentence about
 * capacity. A count of bookings is a sentence about paperwork.
 */
function MonthTotals({
  days,
  sellable,
  occupancy,
}: {
  days: string[];
  sellable: number;
  occupancy: { day: string; taken: number }[];
}) {
  if (sellable === 0) return null;
  const possible = sellable * days.length;
  const sold = occupancy.reduce((n, o) => n + o.taken, 0);
  const full = occupancy.filter((o) => o.taken >= sellable).length;
  const empty = occupancy.filter((o) => o.taken === 0).length;
  const pct = possible > 0 ? Math.round((sold / possible) * 100) : 0;

  return (
    <View style={styles.totals}>
      <View style={styles.totalsRow}>
        <Figure value={`${pct}%`} label="full this month" tone={pct >= 70 ? "ok" : "title"} />
        <Figure value={`${sold}`} label={`of ${possible} room-nights`} tone="title" />
      </View>
      <View style={styles.totalsRow}>
        <Figure
          value={`${full}`}
          label={full === 1 ? "night sold out" : "nights sold out"}
          tone={full > 0 ? "danger" : "muted"}
        />
        <Figure
          value={`${empty}`}
          label={empty === 1 ? "night with nobody" : "nights with nobody"}
          tone={empty > 0 ? "warn" : "muted"}
        />
      </View>
    </View>
  );
}

function Figure({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone: "ok" | "warn" | "danger" | "muted" | "title";
}) {
  return (
    <View style={styles.figure}>
      <Text step="title" weight="bold" tone={tone} tabular numberOfLines={1}>
        {value}
      </Text>
      <Text step="caption" tone="muted" numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

function NightKey() {
  const held = (["PENDING", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] as const).map((state) => {
    const m = NIGHT_MEANING[state];
    return {
      label: m.label,
      fill: m.gone ? color.ink[200] : HELD_FILL[m.firmness],
    };
  });
  return (
    <View style={styles.key}>
      {[{ label: "Free", fill: color.ok.bg }, ...held, { label: "Out of service", fill: color.ink[100] }].map(
        (k) => (
          <View key={k.label} style={styles.keyItem} accessible accessibilityLabel={k.label}>
            <View style={[styles.swatch, { backgroundColor: k.fill }]} />
            <Text step="caption" tone="muted">
              {k.label}
            </Text>
          </View>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  key: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
  },
  keyItem: { flexDirection: "row", alignItems: "center", gap: space.xs },
  swatch: { width: 14, height: 14, borderRadius: 3, borderWidth: 1, borderColor: color.line },
  nav: { padding: space.lg, gap: space.sm, backgroundColor: color.screen },
  sheet: { paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.xs },
  month: { padding: space.lg, gap: space.sm },
  totals: {
    marginHorizontal: space.lg,
    marginBottom: space.xl,
    padding: space.lg,
    gap: space.lg,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.line,
  },
  totalsRow: { flexDirection: "row", gap: space.lg },
  figure: { flex: 1, gap: 2 },
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
  pressed: { backgroundColor: color.ink[100] },
});
