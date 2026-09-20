/**
 * Step 1 — when, and which room.
 *
 * The only part of the form that depends on what the server knows: a room
 * is free for these nights or it is not, and that answer changes the moment
 * the dates do. Asking it first means a clerk never types a guest's name,
 * phone and NID into a booking that cannot be taken.
 *
 * Which rooms can be picked, and why the others cannot, is `roomOffer` in
 * `@rh/shared` — the console's grid draws the same two refusals in the same
 * words, and the two clients book into one calendar.
 */
import { useEffect, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { keys, useApi } from "@rh/app-core";
import {
  BOOKING_GAP_MESSAGES,
  formatMoney,
  nightsBetweenIso,
  roomOffer,
  todayIn,
  type RoomAvail,
} from "@rh/shared";
import { useDraft } from "../../src/booking/draft";
import { client, useAuth } from "../../src/api/session";
import { WhichResort } from "../../src/screens/which-resort";
import { Button } from "../../src/design/button";
import { DateNav } from "../../src/design/date-nav";
import { useMoneyFormat } from "../../src/design/money";
import { Empty, Loading, Problem } from "../../src/design/states";
import { Card } from "../../src/design/surface";
import { Text } from "../../src/design/text";
import { color, radius, space } from "../../src/design/tokens";

export default function WhenAndWhereScreen() {
  const { activeResort } = useAuth();
  const resortId = activeResort?.id;
  const money = useMoneyFormat();
  const draft = useDraft();
  const { checkIn, checkOut, rooms, roomIds, set } = draft;
  const [tried, setTried] = useState(false);

  const grid = useApi(
    keys.availability(resortId, checkIn, checkOut),
    () => client.rooms.availability(resortId!, checkIn, checkOut),
    {
      enabled: resortId !== undefined,
      // the old grid stays on screen while the new dates load, rather than
      // blanking the whole list on every tap of an arrow
      placeholderData: (prev: RoomAvail[] | undefined) => prev,
    },
  );
  const offered: RoomAvail[] = grid.data ?? [];

  /**
   * Whether the guest walks in today.
   *
   * A room's housekeeping state is *now*, so it only bears on a stay that
   * starts now. Without this, every clerk taking a booking for next month
   * would be told half the resort needs cleaning — true this morning, and
   * nothing to do with the guest in front of them. The resort's clock, not
   * the machine's: in Dhaka the two disagree for six hours of every day.
   */
  const arrivingToday = checkIn === todayIn(activeResort?.timezone);

  /**
   * Opened from the day sheet, where a clerk tapped a room that was free.
   *
   * Once only, and only while nothing has been picked: after that the
   * choice is the clerk's, and re-applying the parameter on every render
   * would make an unpicked room pick itself again.
   */
  const { roomId: wanted } = useLocalSearchParams<{ roomId?: string }>();
  const applied = useRef(false);
  useEffect(() => {
    if (applied.current || rooms.length > 0 || offered.length === 0) return;
    const id = Number(wanted);
    if (!Number.isFinite(id)) return;
    const room = offered.find((r) => r.roomId === id);
    if (room && roomOffer(room).sellable) {
      applied.current = true;
      set({ rooms: [room] });
    }
  }, [wanted, offered, rooms.length, set]);

  const nights = nightsBetweenIso(checkIn, checkOut);
  /** Only the half of the rule this step can answer; the guest is step 2's. */
  const needsARoom = roomIds.length === 0;

  function toggle(room: RoomAvail) {
    const has = roomIds.includes(room.roomId);
    set({
      rooms: has ? rooms.filter((r) => r.roomId !== room.roomId) : [...rooms, room],
    });
    if (!has) setTried(false);
  }

  /**
   * Refused rather than greyed out. A disabled button gives no reason, and
   * the console's gave none for months: "Create booking (3 rooms)" sat grey
   * because a name field was scrolled out of sight, which reads as "three
   * rooms cannot go on one booking".
   */
  function next() {
    if (needsARoom) {
      setTried(true);
      return;
    }
    router.push("/new-booking/guest");
  }

  if (resortId === undefined) return <WhichResort what="which rooms are free" />;

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      refreshControl={
        <RefreshControl refreshing={grid.isRefetching} onRefresh={() => void grid.refetch()} />
      }
    >
      <View style={styles.dates}>
        <DateNav
          what="Check-in"
          value={checkIn}
          timezone={activeResort?.timezone}
          onChange={(day) => set({ checkIn: day })}
        />
        <DateNav
          what="Check-out"
          home={false}
          value={checkOut}
          timezone={activeResort?.timezone}
          // a departure on or before the arrival is not a stay; the arrow
          // simply does nothing rather than leaving the form in a state the
          // server will refuse
          onChange={(day) => (day > checkIn ? set({ checkOut: day }) : undefined)}
        />
        <Text step="caption" tone="muted">
          {nights} night{nights === 1 ? "" : "s"}
        </Text>
      </View>

      <Card title="Rooms">
        {grid.error && !grid.data ? (
          <Problem error={grid.error} onRetry={() => void grid.refetch()} />
        ) : !grid.data ? (
          <Loading what="which rooms are free" />
        ) : offered.length === 0 ? (
          <Empty
            message="No rooms yet"
            hint="Add the resort's rooms and they appear here to be booked."
          />
        ) : (
          <View style={styles.grid}>
            {offered.map((room) => (
              <RoomPick
                key={room.roomId}
                room={room}
                arrivingToday={arrivingToday}
                picked={roomIds.includes(room.roomId)}
                money={money}
                onPress={() => toggle(room)}
              />
            ))}
          </View>
        )}
      </Card>

      {tried && needsARoom ? (
        <Text step="small" tone="danger" weight="medium">
          {BOOKING_GAP_MESSAGES.rooms}
        </Text>
      ) : null}

      <Button
        label={
          roomIds.length > 0
            ? `Next: the guest (${roomIds.length} room${roomIds.length === 1 ? "" : "s"})`
            : "Next: the guest"
        }
        onPress={next}
      />
    </ScrollView>
  );
}

/**
 * One room on the grid.
 *
 * Booked is red and temporary — those nights are gone, the room is fine.
 * Out of service is amber and is about the room, not the dates. The whole
 * row is one phrase to a screen reader, because "1 Camellia", "busy (2n)"
 * read as two separate announcements leaves the listener to pair them.
 */
function RoomPick({
  room,
  arrivingToday,
  picked,
  money,
  onPress,
}: {
  room: RoomAvail;
  arrivingToday: boolean;
  picked: boolean;
  money: Parameters<typeof formatMoney>[1];
  onPress: () => void;
}) {
  const offer = roomOffer(room, { arrivingToday });
  const rate = room.agentRate ?? Number(room.baseRate);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${room.roomName}, ${offer.note ?? "free"}`}
      accessibilityState={{ selected: picked, disabled: !offer.sellable }}
      disabled={!offer.sellable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.room,
        offer.why === "busy"
          ? styles.busy
          : offer.why === "closed"
            ? styles.closed
            : picked
              ? styles.picked
              : // a warning, not a refusal: it keeps the tile sellable and
                // only tints it, so the clerk sees it without being stopped
                offer.why === "dirty"
                ? styles.unclean
                : null,
        pressed && offer.sellable && !picked ? styles.pressed : null,
      ]}
    >
      <Text
        step="body"
        weight="medium"
        tone={picked ? "onBrand" : offer.sellable ? "title" : "muted"}
        numberOfLines={1}
      >
        {room.roomName}
      </Text>
      <Text
        step="caption"
        tone={
          picked
            ? "onBrand"
            : offer.why === "busy"
              ? "danger"
              : offer.why === "closed" || offer.why === "dirty"
                ? "warn"
                : "muted"
        }
        numberOfLines={1}
      >
        {formatMoney(rate, { ...money, decimals: 0 })}
        {offer.note ? ` · ${offer.note}` : ""}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  dates: { gap: space.md },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  room: {
    // two to a row on a narrow phone, three once there is space, without a
    // media query: a minimum width plus `flexGrow` does it
    flexGrow: 1,
    flexBasis: "45%",
    gap: 2,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.md,
    backgroundColor: color.surface,
  },
  picked: { backgroundColor: color.brand[600], borderColor: color.brand[600] },
  busy: { backgroundColor: color.danger.bg, borderColor: color.danger.line },
  closed: { backgroundColor: color.warn.bg, borderColor: color.warn.line },
  // the same amber as out of service, and a line rather than a fill, because
  // this room can still be sold and should not read as one that cannot
  unclean: { borderColor: color.warn.line },
  pressed: { backgroundColor: color.ink[100] },
});
