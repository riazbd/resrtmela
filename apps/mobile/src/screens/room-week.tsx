/**
 * A week of a room's nights, as one stretch of a strip that scrolls.
 *
 * What came before: thirty 44-pixel columns scrolling sideways under a
 * pinned column of room names, which the owner saw was full of `…` — a
 * one-night stay got about 36 usable pixels and no name fits in that. Then
 * seven nights across the full width with nothing scrolling, moved a week
 * at a time by arrows and a swipe. The owner's verdict on that one
 * (2026-10-01): *"ami chai, scroll … ektar por ekta date ashte thakbe.
 * infinite"* — dates arriving one after another under the thumb, both ways,
 * with no scroll bar.
 *
 * So the columns stay a seventh of the screen wide — the width that made the
 * names readable — and the strip scrolls through them (`room-scroll.tsx`).
 * This file draws one week of it: the unit the data comes in, not a unit the
 * reader sees. Every column is exactly `col` points, in every week, so a date
 * in the heading is above its night however far somebody has scrolled.
 *
 * **The room's name is not drawn here.** It used to sit on its own line above
 * the strip, and in a strip that scrolls it would scroll away with it. The
 * week leaves a gap of `NAME_H` where the name goes, and `room-scroll.tsx`
 * draws the names once, pinned, over those gaps.
 *
 * **Text only where text fits.** A bar one night wide says nothing and is
 * not asked to; the colour is the answer and a tap gives the name. A bar two
 * nights wide or more carries the guest: `NIGHTS_FOR_A_NAME`.
 *
 * **A week not yet loaded is grey, not green.** Green means "free, take a
 * booking", and drawing nights nobody has asked the server about in that
 * colour is a calendar inventing empty rooms.
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

/** Seven, because a week is the unit a desk thinks in — and what fits across a phone. */
export const WEEK = 7;

/**
 * How many nights a bar needs before a name will fit in it.
 *
 * One night is ~52px less padding — no name fits, at any size, and
 * pretending otherwise is what drew `…` across the old grid.
 */
export const NIGHTS_FOR_A_NAME = 2;

/** One night's height. */
export const ROW = TOUCH_TARGET - 6;
/** The heading's height: weekday, date, rooms left. */
export const HEAD_H = ROW + 14;
/** The line a room's name is drawn on, above its strip. */
export const NAME_H = 24;
/** Below each strip, before the next room's name. */
export const ROOM_GAP = space.md;
/** A whole room — name, strip, gap. The pinned names count in these. */
export const ROOM_H = NAME_H + ROW + ROOM_GAP;

/** Between neighbouring cells, split either side so every column is the same width. */
const SEAM = 1;

/**
 * Booked nights merge into one bar; free nights stay apart.
 *
 * `mergeRuns` merges both, which is right on a grid thirty columns
 * wide and wrong here. A five-night gap drawn as one pill is a pill:
 * the day boundaries vanish, you cannot see *which* nights are free
 * without counting along the header, and you cannot press the
 * Thursday because the Thursday is not a thing on the screen.
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

/** `nights` columns wide, less the seam either side. */
const span = (col: number, nights: number) => ({ width: col * nights - SEAM * 2 });

/** The heading: the dates, and how many rooms are left on each. */
export function WeekHead({
  days,
  taken,
  sellable,
  today,
  col,
  loading = false,
}: {
  days: string[];
  taken: Map<string, number>;
  sellable: number;
  today: string;
  col: number;
  /** the week's bookings have not arrived, so nothing is known to be left */
  loading?: boolean;
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
            accessibilityLabel={
              loading ? `${dayLabel(day)}: loading` : `${dayLabel(day)}: ${gone} of ${sellable} rooms taken`
            }
            style={[
              styles.cell,
              styles.head,
              span(col, 1),
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
              {loading || sellable === 0 ? "–" : `${sellable - gone}`}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * One room's week of nights, under the gap its pinned name is drawn in.
 *
 * A free night is pressable and starts a booking for that room on that
 * date — the thing somebody is nearly always about to do next after
 * finding a gap.
 */
export function RoomWeek({
  room,
  days,
  held,
  col,
  loading = false,
  onOpenBooking,
  onTakeNight,
}: {
  room: Room;
  days: string[];
  held: Map<string, CalendarBooking>;
  col: number;
  loading?: boolean;
  onOpenBooking: (bookingId: number) => void;
  onTakeNight: (roomId: number, day: string) => void;
}) {
  const offService = room.status !== "ACTIVE";

  if (loading) {
    return (
      <View style={styles.room}>
        <View style={styles.strip}>
          {days.map((day) => (
            <View key={day} style={[styles.cell, styles.unknown, span(col, 1)]} />
          ))}
        </View>
      </View>
    );
  }

  const runs = nightByNight(
    mergeRuns(days, (day) => held.get(`${room.id}|${day}`) ?? null, (booking) => booking.id),
  );

  return (
    <View style={styles.room}>
      <View style={styles.strip}>
        {runs.map((run) => {
          const width = span(col, run.nights);
          if (!run.value) {
            return offService ? (
              <View key={run.from} style={[styles.cell, styles.offService, width]} />
            ) : (
              <Pressable
                key={run.from}
                accessibilityRole="button"
                accessibilityLabel={`${room.name} free on ${dayLabel(run.from)}. Take a booking`}
                onPress={() => onTakeNight(room.id, run.from)}
                style={({ pressed }) => [
                  styles.cell,
                  styles.free,
                  width,
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
                width,
                {
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
  strip: { flexDirection: "row" },
  cell: {
    height: ROW,
    marginHorizontal: SEAM,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
    borderRadius: radius.sm,
  },
  head: { height: HEAD_H, backgroundColor: color.surface },
  weekend: { backgroundColor: color.ink[100] },
  todayHead: { borderWidth: 2, borderColor: color.brand[600] },
  /** The name's line is empty here; `room-scroll.tsx` draws the name over it, pinned. */
  room: { paddingTop: NAME_H, paddingBottom: ROOM_GAP },
  /** Green is free, and nothing else on this grid is green. */
  free: { backgroundColor: color.ok.bg, borderWidth: 1, borderColor: color.ok.line },
  offService: { backgroundColor: color.ink[100] },
  /** Not asked yet — neither free nor taken. */
  unknown: { backgroundColor: color.ink[100], opacity: 0.6 },
  pressed: { opacity: 0.6 },
});
