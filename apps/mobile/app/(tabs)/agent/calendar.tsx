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
  MONTHS_LONG,
  addDaysIso,
  freeRoomsByNight,
  isWeekend,
  monthGrid,
  monthLength,
  monthOf,
  monthStart,
  todayIn,
  type AgencyCalendar,
  PLATFORM_TIMEZONE,
} from "@rh/shared";
import { client, useAuth } from "../../../src/api/session";
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

  const free = useMemo(
    () => freeRoomsByNight(feed.data?.resorts ?? [], from, to),
    [feed.data, from, to],
  );

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
  const [year, mm] = month.split("-");
  const title = `${MONTHS_LONG[Number(mm) - 1]} ${year}`;
  const resorts = feed.data.resorts;

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
        <View style={styles.months}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            style={styles.arrow}
            onPress={() => setMonth(monthOf(addDaysIso(from, -1)))}
          >
            <Text step="body" tone="ok">
              ‹
            </Text>
          </Pressable>
          <Text step="strong" weight="medium" tone="title">
            {title}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next month"
            style={styles.arrow}
            onPress={() => setMonth(monthOf(addDaysIso(to, 1)))}
          >
            <Text step="body" tone="ok">
              ›
            </Text>
          </Pressable>
        </View>

        {resorts.length === 0 ? (
          <View style={styles.middle}>
            <Empty
              message="No resorts open to you yet"
              hint="A resort has to sell through agencies before its nights appear here."
            />
          </View>
        ) : (
          <>
            <Card title={`Rooms free — ${resorts.length} resort${resorts.length === 1 ? "" : "s"}`}>
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
                      />
                    ),
                  )}
                </View>
              ))}
            </Card>

            <Text step="caption" tone="muted" style={styles.footnote}>
              The number is rooms free across every resort you sell. Tap a
              night to see which ones.
            </Text>
          </>
        )}
      </ScrollView>
    </>
  );
}

function Night({ night, count, today }: { night: string; count: number; today: boolean }) {
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
                `/agent/search?checkIn=${night}&checkOut=${addDaysIso(night, 1)}` as never,
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
  footnote: { textAlign: "center" },
});
