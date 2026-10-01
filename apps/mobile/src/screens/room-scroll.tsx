/**
 * The rooms, night after night, scrolled sideways for as long as anybody likes.
 *
 * The owner, 2026-10-01: *"swip korle next week dekhai … ami chai, scroll.
 * side scroll but kono scroll bar dekhabe na. scroll korle ektar por ekta
 * date ba day ashte thakbe. infinite, prev scroll o laagbe, next scroll o
 * laagbe."* A swipe that jumped a week at a time redrew the screen under the
 * thumb; what was wanted was the strip itself moving, a day at a time, both
 * ways, with nothing at either end.
 *
 * **A horizontal `FlatList` of weeks.** Ten years either side of where it
 * opened — 1,041 weeks, which nobody reaches by scrolling — and only the few
 * near the screen exist at any moment, so it costs what a week costs. Each
 * week asks for its own bookings under the same cache key the rest of the
 * app uses (`keys.calendar(resort, from, to)`), so scrolling back over a week
 * already seen asks for nothing, and the week the screen opens on is the one
 * the screen has already loaded.
 *
 * **It comes to rest on a day.** `snapToInterval` is one column, so a scroll
 * that ends half-way across Thursday settles with a whole day at the left
 * edge and the heading's dates exactly over their nights.
 *
 * **The names do not scroll.** They are drawn once, over the gap each week
 * leaves for them, by a layer that ignores touches — so a name stays readable
 * at the left while the nights move under it, and a tap on a night still
 * reaches the night.
 */
import { forwardRef, memo, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  FlatList,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { keys, useApi } from "@rh/app-core";
import {
  addDaysIso,
  nightsBetweenIso,
  nightsHeld,
  occupancyOf,
  type CalendarBooking,
  type Room,
} from "@rh/shared";
import { client } from "../api/session";
import { Text } from "../design/text";
import { space } from "../design/tokens";
import { HEAD_H, NAME_H, ROOM_H, RoomWeek, WEEK, WeekHead } from "./room-week";

/** Weeks either side of where it opened: ten years, which nobody scrolls through. */
export const WEEKS_EACH_WAY = 520;

/** The screen's side margin; the strip runs inside it. */
const EDGE = space.lg;

export interface RoomScrollHandle {
  /** Bring this day to the left edge. */
  goTo: (day: string, animated?: boolean) => void;
  /** Whether a day is inside the strip at all. */
  reaches: (day: string) => boolean;
}

/** One week of every room, with its own bookings. */
const Week = memo(function Week({
  resortId,
  start,
  rooms,
  sellableIds,
  today,
  col,
  onOpenBooking,
  onTakeNight,
}: {
  resortId: number;
  start: string;
  rooms: Room[];
  sellableIds: number[];
  today: string;
  col: number;
  onOpenBooking: (bookingId: number) => void;
  onTakeNight: (roomId: number, day: string) => void;
}) {
  const end = addDaysIso(start, WEEK);
  const days = useMemo(() => Array.from({ length: WEEK }, (_, i) => addDaysIso(start, i)), [start]);
  const q = useApi<{ bookings: CalendarBooking[] }>(
    keys.calendar(resortId, start, end),
    () => client.calendar(resortId, start, end),
    // a week scrolled past and back within the minute is not asked for again,
    // and the opening week is the one the screen has only just loaded
    { staleTime: 60_000 },
  );
  const bookings: CalendarBooking[] = useMemo(() => q.data?.bookings ?? [], [q.data]);
  const held = useMemo(() => nightsHeld(bookings, days), [bookings, days]);
  const taken = useMemo(
    () => new Map(occupancyOf(days, sellableIds, held).map((o) => [o.day, o.taken])),
    [days, sellableIds, held],
  );
  const loading = !q.data;

  return (
    <View style={{ width: col * WEEK }}>
      <WeekHead days={days} taken={taken} sellable={sellableIds.length} today={today} col={col} loading={loading} />
      {rooms.map((room) => (
        <RoomWeek
          key={room.id}
          room={room}
          days={days}
          held={held}
          col={col}
          loading={loading}
          onOpenBooking={onOpenBooking}
          onTakeNight={onTakeNight}
        />
      ))}
    </View>
  );
});

export const RoomScroll = forwardRef<
  RoomScrollHandle,
  {
    resortId: number;
    /** The day at the left edge when it opens; the strip is measured from it. */
    origin: string;
    rooms: Room[];
    today: string;
    /** Told the day at the left edge whenever it changes. */
    onSeen: (day: string) => void;
    onOpenBooking: (bookingId: number) => void;
    onTakeNight: (roomId: number, day: string) => void;
  }
>(function RoomScroll({ resortId, origin, rooms, today, onSeen, onOpenBooking, onTakeNight }, ref) {
  const { width } = useWindowDimensions();
  /** A seventh of the room inside the margins, as it was when nothing scrolled. */
  const col = (width - EDGE * 2) / WEEK;
  const weekWidth = col * WEEK;

  /** Where week 0 starts. Fixed for the life of the strip, so a day's offset never moves. */
  const [base] = useState(() => addDaysIso(origin, -WEEKS_EACH_WAY * WEEK));
  const weeks = useMemo(() => Array.from({ length: WEEKS_EACH_WAY * 2 + 1 }, (_, i) => i), []);
  const sellableIds = useMemo(
    () => rooms.filter((r) => r.status === "ACTIVE").map((r) => r.id),
    [rooms],
  );

  const list = useRef<FlatList<number>>(null);
  const seen = useRef(origin);
  const lastDay = weeks.length * WEEK - 1;

  useImperativeHandle(
    ref,
    () => ({
      goTo: (day, animated = true) => {
        const at = Math.min(Math.max(nightsBetweenIso(base, day), 0), lastDay);
        list.current?.scrollToOffset({ offset: at * col, animated });
        // said now rather than when the scroll lands: the label should
        // answer the press, and a test renderer never scrolls at all
        if (seen.current !== day) {
          seen.current = day;
          onSeen(day);
        }
      },
      reaches: (day) => {
        const at = nightsBetweenIso(base, day);
        return at >= 0 && at <= lastDay;
      },
    }),
    [base, col, lastDay, onSeen],
  );

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const at = Math.round(e.nativeEvent.contentOffset.x / col);
      const day = addDaysIso(base, at);
      if (day !== seen.current) {
        seen.current = day;
        onSeen(day);
      }
    },
    [base, col, onSeen],
  );

  const renderItem = useCallback(
    ({ item }: { item: number }) => (
      <Week
        resortId={resortId}
        start={addDaysIso(base, item * WEEK)}
        rooms={rooms}
        sellableIds={sellableIds}
        today={today}
        col={col}
        onOpenBooking={onOpenBooking}
        onTakeNight={onTakeNight}
      />
    ),
    [resortId, base, rooms, sellableIds, today, col, onOpenBooking, onTakeNight],
  );

  return (
    <View style={styles.frame}>
      <FlatList
        ref={list}
        horizontal
        data={weeks}
        keyExtractor={(i) => String(i)}
        renderItem={renderItem}
        getItemLayout={(_, index) => ({ length: weekWidth, offset: weekWidth * index, index })}
        initialScrollIndex={WEEKS_EACH_WAY}
        // the week on screen and the one coming; the rest are made as they near
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        windowSize={5}
        showsHorizontalScrollIndicator={false}
        snapToInterval={col}
        decelerationRate="fast"
        onScroll={onScroll}
        scrollEventThrottle={32}
        testID="room-scroll"
      />

      {/* the names, pinned: drawn once over the gap every week leaves for them */}
      <View pointerEvents="none" style={[styles.names, { top: HEAD_H }]}>
        {rooms.map((room) => {
          const offService = room.status !== "ACTIVE";
          return (
            <View
              key={room.id}
              style={styles.nameRow}
              accessible
              accessibilityLabel={`Room ${room.name}${offService ? ", out of service" : ""}`}
            >
              <Text step="small" weight="medium" tone={offService ? "muted" : "title"} numberOfLines={1}>
                {room.name}
              </Text>
              {offService ? (
                <Text step="caption" tone="muted">
                  out of service
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  frame: { marginHorizontal: EDGE, paddingBottom: space.xl },
  names: { position: "absolute", left: 0, right: 0 },
  nameRow: {
    height: ROOM_H,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
    paddingTop: (NAME_H - 18) / 2,
    paddingHorizontal: space.xs,
  },
});
