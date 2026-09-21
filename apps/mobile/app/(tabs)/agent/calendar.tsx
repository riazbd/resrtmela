/**
 * The month, as one number a night: how many rooms this agency could sell.
 *
 * The console draws a grid — a row per room, a column per night, across
 * every resort the agency sells. Eighty rows will not go on four inches,
 * and trying is how the resort-side calendar ended up scrolling sideways
 * under a pinned column. But an agent on a phone is not auditing
 * occupancy: they have somebody in front of them asking about a date,
 * and the answer to that is a number.
 *
 * So the grid is asked one question per night and the answer is drawn.
 * Tapping a night takes the search to it, which is the next thing that
 * person does anyway. A night with nothing free is not tappable — the
 * search would come back empty and they would have learned it twice.
 *
 * The counting is `@rh/shared`'s `freeRoomsByNight`, not this screen's.
 * A night the phone calls free and the console calls taken is a room
 * sold twice, and that is exactly the kind of disagreement a second
 * implementation produces.
 */
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, router } from "expo-router";
import { keys, useApi } from "@rh/app-core";
import {
  addDaysIso,
  freeRoomsByNight,
  isWeekend,
  monthGrid,
  monthLength,
  monthOf,
  monthStart,
  todayIn,
  type AgencyCalendar,
  type AgencyResortMonth,
  PLATFORM_TIMEZONE,
} from "@rh/shared";
import { MonthBar } from "../../../src/design/month-bar";
import { client, useAuth } from "../../../src/api/session";
import { Chip } from "../../../src/design/chip";
import { Empty, Loading, Problem, Stale } from "../../../src/design/states";
import { Card } from "../../../src/design/surface";
import { Text } from "../../../src/design/text";
import { TOUCH_TARGET, color, radius, space } from "../../../src/design/tokens";

const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

export default function AgentCalendarScreen() {
  const { me } = useAuth();
  // an agency has no resort and so no resort's timezone; its month is its own
  const [month, setMonth] = useState(() => monthOf(todayIn(PLATFORM_TIMEZONE)));

  const from = monthStart(month) ?? todayIn(PLATFORM_TIMEZONE);
  const to = addDaysIso(from, monthLength(month) - 1);

  const feed = useApi<AgencyCalendar>(
    keys.agentCalendar(from, to),
    () => client.agent.calendar({ from, to }),
    { enabled: Boolean(me) },
  );

  /**
   * One resort, or all of them.
   *
   * The grid answers "is there anything free" across everything the
   * agency sells, which is the right first question and the wrong second
   * one. An agent whose customer has already picked the resort was being
   * shown a number that counts four other resorts' rooms — so a month
   * reading 12 free could be 12 somewhere else and none where they are
   * being asked about.
   *
   * Filtered here rather than re-asked of the server: the month's feed
   * already carries every resort's rooms and nights, `freeRoomsByNight`
   * is the counting rule whichever list it is given, and an agent on a
   * hill road switching resorts should not need a connection to do it.
   */
  const [only, setOnly] = useState<number | null>(null);
  const all = feed.data?.resorts ?? [];
  const shown = useMemo(
    // a resort chosen last month may not be in this month's feed at all,
    // and filtering to nothing would draw an empty month rather than say so
    () =>
      only !== null && all.some((r) => r.resort.id === only)
        ? all.filter((r) => r.resort.id === only)
        : all,
    [all, only],
  );

  const free = useMemo(() => freeRoomsByNight(shown, from, to), [shown, from, to]);

  /**
   * No `title` here. A tab is named by the bar, which runs the
   * console's label through `barLabel` so it fits; a title set on the
   * screen overrides that from underneath and the bar goes back to
   * an ellipsis. `a-tab-does-not-name-itself.spec.ts` is the rule.
   */
  const header = null;

  if (feed.error && !feed.data) {
    return (
      <>
        {header}
        <Problem error={feed.error} onRetry={() => void feed.refetch()} />
      </>
    );
  }

  if (!feed.data) {
    return (
      <>
        {header}
        <Loading what="the month" />
      </>
    );
  }

  const weeks = monthGrid(month);
  const resorts = feed.data.resorts;
  /**
   * The one being counted, when it is one rather than all of them.
   *
   * Looked up rather than remembered, so a resort picked last month that
   * this month's feed does not carry falls back to all of them — the
   * same rule `shown` applies, asked once.
   */
  const chosen = only === null ? null : (resorts.find((r) => r.resort.id === only) ?? null);

  return (
    <>
      {header}
      <Stale age={feed.stale} />
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={
          <RefreshControl refreshing={feed.isRefetching} onRefresh={() => void feed.refetch()} />
        }
      >
        {/*
          Two arrows and a label was the whole of it, so an agent quoting
          for next March pressed `›` six times and one quoting for last
          season could not get there at all. The month's own name opens
          a year and twelve months now — the same control the resort's
          calendar uses, because it is the same question.
        */}
        <MonthBar month={month} today={todayIn(PLATFORM_TIMEZONE)} onChange={setMonth} />

        {resorts.length === 0 ? (
          <View style={styles.middle}>
            <Empty
              message="No resorts open to you yet"
              hint="A resort has to sell through agencies before its nights appear here."
            />
          </View>
        ) : (
          <>
            {/*
              Which resort the grid is counting. One resort needs no
              chooser — a choice of one is not a choice, and drawing it
              is a row of nothing to decide.
            */}
            {resorts.length > 1 ? (
              <View style={styles.picker}>
                <Chip label="All resorts" on={only === null} onPress={() => setOnly(null)} />
                {resorts.map((r) => (
                  <Chip
                    key={r.resort.id}
                    label={r.resort.name}
                    on={only === r.resort.id}
                    onPress={() => setOnly(only === r.resort.id ? null : r.resort.id)}
                  />
                ))}
              </View>
            ) : null}

            <Card
              title={
                chosen
                  ? `Rooms free — ${chosen.resort.name}`
                  : `Rooms free — ${resorts.length} resort${resorts.length === 1 ? "" : "s"}`
              }
            >
              <View style={styles.weekdays}>
                {WEEKDAY_INITIALS.map((d, i) => (
                  <Text key={i} step="caption" tone="muted" style={styles.weekday}>
                    {d}
                  </Text>
                ))}
              </View>
              {weeks.map((week, wi) => (
                <View key={wi} style={styles.week}>
                  {week.map((night, di) =>
                    night === null ? (
                      <View key={di} style={styles.cell} />
                    ) : (
                      <Night
                        key={night}
                        night={night}
                        today={night === todayIn(PLATFORM_TIMEZONE)}
                        count={free.get(night) ?? 0}
                        resortId={chosen?.resort.id}
                      />
                    ),
                  )}
                </View>
              ))}
            </Card>

            <Text step="caption" tone="muted" style={styles.footnote}>
              {chosen
                ? `The number is rooms free at ${chosen.resort.name}. Tap a night to open the search for it.`
                : "The number is rooms free across every resort you sell. Tap a night to open the search for it."}
            </Text>

            {/*
              Which resort the free rooms are in.

              The grid gives one number a night across everything, which
              answers "is there anything" and not "where". The footnote
              used to say "tap a night to see which ones" — a whole
              screen away, for a question the data already on this page
              can answer. Under the grid, where nine hundred pixels of
              nothing used to be.
            */}
            <WhereTheRoomsAre resorts={resorts} from={from} to={to} chosen={only} />
          </>
        )}
      </ScrollView>
    </>
  );
}

/**
 * A line per resort: how much of it is free across the month.
 *
 * Room-nights rather than rooms, because a resort with four rooms open
 * every night of September has more to sell than one with twelve rooms
 * open on a Tuesday, and an agent choosing where to place a group
 * needs the first number.
 *
 * Sorted by what is most available, which is the order somebody
 * looking for space reads in.
 */
function WhereTheRoomsAre({
  resorts,
  from,
  to,
  chosen,
}: {
  resorts: AgencyResortMonth[];
  from: string;
  to: string;
  /** The resort the grid above is counting, or null for all of them. */
  chosen: number | null;
}) {
  const nights = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1);

  const rows = resorts
    .map((r) => {
      const sellable = r.rooms.filter((room) => room.status === "ACTIVE").length;
      // `freeRoomsByNight` is the counting rule; asked of one resort at a
      // time it gives this resort's share, so the lines add to the grid
      const free = freeRoomsByNight([r], from, to);
      const spare = [...free.values()].reduce((n, v) => n + v, 0);
      return { id: r.resort.id, name: r.resort.name, sellable, spare, possible: sellable * nights };
    })
    .filter((r) => r.sellable > 0)
    .sort((a, b) => b.spare - a.spare);

  if (rows.length === 0) return null;

  return (
    <Card title="Where the space is">
      {rows.map((r) => (
        <View
          key={r.id}
          style={styles.whereRow}
          accessible
          accessibilityLabel={`${r.name}: ${r.spare} room-nights free of ${r.possible} this month${
            chosen === r.id ? ", the one the month is counting" : ""
          }`}
        >
          <Text
            step="body"
            tone="title"
            // the chooser above decides what the grid counts; this line
            // says which one that was, so the two cannot read differently
            weight={chosen === r.id ? "medium" : undefined}
            style={styles.whereName}
            numberOfLines={1}
          >
            {r.name}
          </Text>
          <Text step="body" weight="medium" tone={r.spare > 0 ? "ok" : "muted"} tabular>
            {r.spare}
          </Text>
          <Text step="caption" tone="muted" tabular>
            / {r.possible}
          </Text>
        </View>
      ))}
    </Card>
  );
}

function Night({
  night,
  count,
  today,
  resortId,
}: {
  night: string;
  count: number;
  today: boolean;
  /** Set when the grid is counting one resort, so the search opens on it too. */
  resortId?: number;
}) {
  const day = Number(night.slice(8));
  const none = count === 0;
  return (
    <Pressable
      accessibilityRole={none ? "text" : "button"}
      accessibilityLabel={
        `${today ? "Today, " : ""}${
          none ? `${day}: nothing free` : `${day}: ${count} room${count === 1 ? "" : "s"} free`
        }`
      }
      // a night with nothing left is not worth a search that comes back
      // empty; the number has already said it
      onPress={
        none
          ? undefined
          : () =>
              router.push(
                `/agent/search?checkIn=${night}&checkOut=${addDaysIso(night, 1)}${
                  resortId === undefined ? "" : `&resortId=${resortId}`
                }` as never,
              )
      }
      /*
        Today is marked. Every other dated screen in this app says so,
        and a month grid that does not makes a reader count rows to find
        out where they are.
      */
      style={[
        styles.cell,
        isWeekend(night) ? styles.weekendCell : null,
        today ? styles.todayCell : null,
      ]}
    >
      <Text step="caption" tone={today ? "ok" : "muted"} weight={today ? "medium" : undefined}>
        {day}
      </Text>
      <Text
        step="body"
        weight="medium"
        tone={none ? "muted" : "ok"}
        tabular
      >
        {count}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  months: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  arrow: {
    minWidth: TOUCH_TARGET,
    minHeight: TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  weekdays: { flexDirection: "row", paddingBottom: space.xs },
  weekday: { flex: 1, textAlign: "center" },
  week: { flexDirection: "row" },
  // an outline, not a fill: the fill is what a weekend uses, and today
  // falling on a Friday must still read as both
  todayCell: { borderWidth: 1, borderColor: color.brand[600] },
  cell: {
    flex: 1,
    minHeight: TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    paddingVertical: space.xs,
  },
  weekendCell: { backgroundColor: color.ink[50] },
  middle: { paddingVertical: space.xl },
  whereRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: TOUCH_TARGET - space.md,
  },
  whereName: { flex: 1 },
  footnote: { textAlign: "center" },
  picker: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
