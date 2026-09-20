/**
 * Every room, what it costs, and whether it can be sold.
 *
 * A tab on the bar, which is why it is the first screen of phase 2: it has
 * said "Not built yet" on every phone that installed 0.2.1, and no other
 * gap in the app is that visible.
 *
 * The console draws this as a six-column table. A phone has room for the
 * three things somebody scanning the list is looking for — which room,
 * what it costs a night, and whether it is open — with the rest behind
 * the row.
 *
 * **The order is the server's, and this screen does not touch it.**
 * `listRooms` sorts with `byRoomName` and says why: grouped by type, an
 * eight-room resort read 3, 4, 5, 6, 7, 8, 1, 2. This file sorted again
 * on its first afternoon, with a comment claiming the route sent
 * creation order — it does not, and the comment was written from the
 * type rather than from the service. Harmless, because it was the same
 * comparator, and wrong in the way the day sheet's room order was wrong:
 * a client holding a second opinion about order is one release away from
 * overriding the server's.
 */
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, router } from "expo-router";
import { keys, useApi } from "@rh/app-core";
import {
  extraPersonNote,
  formatMoney,
  housekeepingLabel,
  roomStatusLabel,
  type Room,
} from "@rh/shared";
import { client, useAuth } from "../../src/api/session";
import { WhichResort } from "../../src/screens/which-resort";
import { useMoneyFormat } from "../../src/design/money";
import { Empty, Loading, Problem, Stale } from "../../src/design/states";
import { Card, Row } from "../../src/design/surface";
import { Text } from "../../src/design/text";
import { color, radius, space } from "../../src/design/tokens";

export default function RoomsScreen() {
  const { activeResort } = useAuth();
  const resortId = activeResort?.id;
  const money = useMoneyFormat();

  const list = useApi(keys.rooms(resortId), () => client.rooms.list(resortId!), {
    enabled: resortId !== undefined,
  });

  // the server's order, kept — see the note at the top of this file
  const rooms = list.data ?? [];

  /**
   * No `title` here. A tab is named by the bar, which runs the
   * console's label through `barLabel` so it fits; a title set on the
   * screen overrides that from underneath and the bar goes back to
   * an ellipsis. `a-tab-does-not-name-itself.spec.ts` is the rule.
   */
  const header = null;

  if (resortId === undefined) {
    return (
      <>
        {header}
        <WhichResort what="the rooms" />
      </>
    );
  }

  if (list.error && !list.data) {
    return (
      <>
        {header}
        <Problem error={list.error} onRetry={() => void list.refetch()} />
      </>
    );
  }

  if (!list.data) {
    return (
      <>
        {header}
        <Loading what="the rooms" />
      </>
    );
  }

  const open = rooms.filter((r) => r.status === "ACTIVE").length;

  return (
    <>
      {header}
      <Stale age={list.stale} />
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={
          <RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />
        }
      >
        <Card title={`${rooms.length} room${rooms.length === 1 ? "" : "s"}`}>
          {rooms.length === 0 ? (
            <View style={styles.emptyBox}>
              <Empty
                message="No rooms yet"
                hint="Add the resort's rooms on the desk and they appear here."
              />
            </View>
          ) : (
            <>
              <Text step="caption" tone="muted" style={styles.count}>
                {open} sellable
              </Text>
              {rooms.map((room, i) => (
                <RoomRow
                  key={room.id}
                  room={room}
                  money={money}
                  last={i === rooms.length - 1}
                  onPress={() => router.push(`/rooms/${room.id}` as never)}
                />
              ))}
            </>
          )}
        </Card>

        <Card title="Room types">
          <Row
            title="Types, occupancy and amenities"
            subtitle="What each kind of room sleeps"
            last
            accessibilityLabel="Room types"
            onPress={() => router.push("/rooms/types" as never)}
          />
        </Card>
      </ScrollView>
    </>
  );
}

function RoomRow({
  room,
  money,
  last,
  onPress,
}: {
  room: Room;
  money: Parameters<typeof formatMoney>[1];
  last: boolean;
  onPress: () => void;
}) {
  const shut = room.status !== "ACTIVE";
  const extra = extraPersonNote(room, money);
  const rate = formatMoney(room.baseRate, { ...money, decimals: 0 });
  /**
   * Only when there is something to do about it.
   *
   * A clean room says nothing, because a badge on ten rows out of ten is
   * a badge nobody reads — the housekeeping screen made exactly that
   * mistake on its first afternoon. And out of service wins when a room
   * is both: one is a decision about the room, the other is twenty
   * minutes of work.
   */
  const unclean = !shut && room.housekeeping && room.housekeeping !== "CLEAN"
    ? housekeepingLabel(room.housekeeping)
    : null;

  /** The row as one sentence — see `Stat` for why. */
  const spoken = `${room.name}, ${rate} a night, ${roomStatusLabel(room.status).toLowerCase()}${
    unclean ? `, ${unclean.toLowerCase()}` : ""
  }${extra ? `, takes ${extra}` : ""}`;

  return (
    <Row
      title={room.name}
      subtitle={[room.roomType?.name, extra].filter(Boolean).join(" · ") || undefined}
      last={last}
      accessibilityLabel={spoken}
      onPress={onPress}
      right={
        <View style={styles.right}>
          <Text step="body" weight="medium" tone={shut ? "muted" : "title"} tabular>
            {rate}
          </Text>
          {shut ? (
            <View style={styles.shut}>
              <Text step="caption" weight="medium" tone="warn">
                Out of service
              </Text>
            </View>
          ) : unclean ? (
            <View style={styles.unclean}>
              <Text step="caption" weight="medium" tone="warn">
                {unclean}
              </Text>
            </View>
          ) : null}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  count: { paddingBottom: space.sm },
  right: { alignItems: "flex-end", gap: space.xs },
  emptyBox: { paddingVertical: space.lg },
  // the same chip as out of service: both are "you cannot just hand over
  // the key", and a second colour here would imply a second kind of thing
  unclean: {
    backgroundColor: color.warn.bg,
    borderWidth: 1,
    borderColor: color.warn.line,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  shut: {
    backgroundColor: color.warn.bg,
    borderWidth: 1,
    borderColor: color.warn.line,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
});
