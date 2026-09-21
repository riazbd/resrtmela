/**
 * A room's week, seven nights across the screen (2026-09-21).
 *
 * What this replaces: thirty 44-pixel columns scrolling sideways under
 * a pinned column of room names. Two things were wrong with it, and
 * the owner saw both.
 *
 * **The names were ellipses.** A one-night stay got a 44px cell, and
 * after padding that is about 36px — which holds no name at any size,
 * so the grid drew `…` and nothing else. A two-night stay managed four
 * characters. The screen's entire content was a row of dots.
 *
 * **Sideways scrolling hides the question.** To compare the 22nd across
 * rooms you scrolled to it, and to check it against the 8th you
 * scrolled back, and the answer lived in your memory rather than on the
 * screen.
 *
 * So: seven nights, the full width of the phone, nothing to scroll
 * horizontally. The room's name goes on its own line *above* its strip
 * rather than in a column beside it — which costs a little height and
 * buys two things: every cell grows from 44px to about 52, and a room
 * called "Hill View Cottage 2" is readable instead of "Hill View…".
 *
 * **Text only where text fits.** A bar one night wide says nothing and
 * is not asked to; the colour is the answer and a tap gives the name.
 * A bar two nights wide or more carries the guest. Guessing wrong here
 * is what produced the dots, so it is a measurement rather than a hope:
 * `NIGHTS_FOR_A_NAME`.
 */
import { Pressable, StyleSheet, View } from "react-native";
import {
  NIGHT_MEANING,
  dayLabel,
  isHeldState,
  addDaysIso,
  isWeekend,
  mergeRuns,
  weekdayShort,
  type CalendarBooking,
  type Room,
  type Run,
} from "@rh/shared";
import { Text } from "../design/text";
import { TOUCH_TARGET, color, radius, space } from "../design/tokens";

/** Seven, because a week is the unit a desk thinks in. */
export const WEEK = 7;

/**
 * How many nights a bar needs before a name will fit in it.
 *
 * One night is ~52px less padding — no name fits, at any size, and
 * pretending otherwise is what drew `…` across the old grid.
 */
export const NIGHTS_FOR_A_NAME = 2;

const ROW = TOUCH_TARGET - 6;

/**
 * Booked nights merge into one bar; free nights stay apart.
 *
 * `mergeRuns` merges both, which is right on a grid thirty columns
 * wide and wrong here. A five-night gap drawn as one pill is a pill:
 * the day boundaries vanish, you cannot see *which* nights are free
 * without counting along the header, and you cannot press the
 * Thursday because the Thursday is not a thing on the screen. Seen in
 * a screenshot — every label the tests read was correct.
 */
function nightByNight(runs: Run<CalendarBooking>[]): Run<CalendarBooking>[] {
  return runs.flatMap((run) =>
    run.value
      ? [run]
      : Array.from({ length: run.nights }, (_, i) => ({
          from: addDaysIso(run.from, i),
          nights: 1,
          value: null,
        })),
  );
}

/** Red by how firmly the night is held — the console's ramp, in these tokens. */
const HELD_FILL: Record<1 | 2 | 3, string> = {
  1: color.danger.bg,
  2: color.danger.line,
  3: color.danger.fg,
};

/** The heading: seven dates, and how many rooms are gone on each. */
export function WeekHead({
  days,
  taken,
  sellable,
  today,
}: {
  days: string[];
  taken: Map<string, number>;
  sellable: number;
  today: string;
}) {
  return (
    <View style={styles.strip}>
      {days.map((day) => {
        const gone = taken.get(day) ?? 0;
        const full = sellable > 0 && gone >= sellable;
        return (
          <View
            key={day}
            accessible
            accessibilityLabel={`${dayLabel(day)}: ${gone} of ${sellable} rooms taken`}
            style={[
              styles.cell,
              styles.head,
              isWeekend(day) ? styles.weekend : null,
              day === today ? styles.todayHead : null,
            ]}
          >
            <Text step="caption" tone="muted">
              {weekdayShort(day)}
            </Text>
            <Text step="small" weight="bold" tone={day === today ? "ok" : "title"} tabular>
              {Number(day.slice(8, 10))}
            </Text>
            <Text step="caption" tone={full ? "danger" : "muted"} tabular>
              {sellable > 0 ? `${sellable - gone}` : "–"}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * One room: its name, then its seven nights.
 *
 * A free night is pressable and starts a booking for that room on that
 * date — the thing somebody is nearly always about to do next after
 * finding a gap.
 */
export function RoomWeek({
  room,
  days,
  held,
  onOpenBooking,
  onTakeNight,
}: {
  room: Room;
  days: string[];
  held: Map<string, CalendarBooking>;
  onOpenBooking: (bookingId: number) => void;
  onTakeNight: (roomId: number, day: string) => void;
}) {
  const offService = room.status !== "ACTIVE";
  const runs = nightByNight(
    mergeRuns(days, (day) => held.get(`${room.id}|${day}`) ?? null, (booking) => booking.id),
  );

  return (
    <View style={styles.room}>
      <View
        style={styles.roomName}
        accessible
        accessibilityLabel={`Room ${room.name}${offService ? ", out of service" : ""}`}
      >
        {/*
          Its own line, full width: this is the fix for "Hill View…".
          Two lines allowed, because a name the owner typed is a name
          they wanted to read.
        */}
        <Text step="small" weight="medium" tone={offService ? "muted" : "title"} numberOfLines={2}>
          {room.name}
        </Text>
        {offService ? (
          <Text step="caption" tone="muted">
            out of service
          </Text>
        ) : null}
      </View>

      <View style={styles.strip}>
        {runs.map((run) => {
          const flex = run.nights;
          if (!run.value) {
            return offService ? (
              <View key={run.from} style={[styles.cell, styles.offService, { flex }]} />
            ) : (
              <Pressable
                key={run.from}
                accessibilityRole="button"
                accessibilityLabel={`${room.name} free on ${dayLabel(run.from)}. Take a booking`}
                onPress={() => onTakeNight(room.id, run.from)}
                style={({ pressed }) => [
                  styles.cell,
                  styles.free,
                  { flex },
                  pressed ? styles.pressed : null,
                ]}
              />
            );
          }

          const booking = run.value;
          const meaning = isHeldState(booking.state) ? NIGHT_MEANING[booking.state] : null;
          const who = booking.guestName || booking.agentName || booking.code;
          const roomForAName = run.nights >= NIGHTS_FOR_A_NAME;
          return (
            <Pressable
              key={run.from}
              accessibilityRole="button"
              accessibilityLabel={`${who}, ${meaning?.label ?? booking.state}, ${dayLabel(
                run.from,
              )} for ${run.nights} night${run.nights === 1 ? "" : "s"}, ${room.name}`}
              onPress={() => onOpenBooking(booking.id)}
              style={({ pressed }) => [
                styles.cell,
                {
                  flex,
                  backgroundColor: meaning?.gone ? color.ink[200] : HELD_FILL[meaning?.firmness ?? 2],
                },
                pressed ? styles.pressed : null,
              ]}
            >
              {roomForAName ? (
                <Text
                  step="caption"
                  weight="medium"
                  numberOfLines={1}
                  tone={meaning && !meaning.gone && meaning.firmness === 3 ? "onBrand" : "body"}
                >
                  {who}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /** Every strip is the same seven flexible columns, so the dates line up. */
  strip: { flexDirection: "row", gap: 2 },
  cell: {
    height: ROW,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
    borderRadius: radius.sm,
  },
  /**
   * `flex: 1`, and it is the whole reason the grid reads.
   *
   * Without it the seven heading cells sized to their own content and
   * stopped halfway across, while the strips below stretched to the
   * full width — so the date above a bar was not the date the bar was
   * on. Every test passed: the labels were all correct, and a label
   * cannot be in the wrong place.
   */
  head: { flex: 1, height: ROW + 14, backgroundColor: color.surface },
  weekend: { backgroundColor: color.ink[100] },
  todayHead: { borderWidth: 2, borderColor: color.brand[600] },
  room: { gap: space.xs, paddingBottom: space.md },
  roomName: { paddingHorizontal: space.xs },
  /** Green is free, and nothing else on this grid is green. */
  free: { backgroundColor: color.ok.bg, borderWidth: 1, borderColor: color.ok.line },
  offService: { backgroundColor: color.ink[100] },
  pressed: { opacity: 0.6 },
});
