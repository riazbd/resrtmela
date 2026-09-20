/**
 * Every room, what it costs, and whether it can be sold.
 *
 * A tab on the bar, which is why it is the first screen of phase 2: it has
 * said "Not built yet" on every phone that installed 0.2.1, and no other
 * gap in the app is that visible.
 *
 * The console draws this as a six-column table. A phone has room for the
 * three things somebody scanning the list is looking for — which room,
 * what it costs a night, and whether it is open — with the rest behind the
 * row. The order is the server's, sorted by `byRoomName` because the API
 * sends rooms in creation order here and "10 Bakul" belongs after
 * "9 Krishnachura" rather than after "1 Camellia".
 */
import { useMemo } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, router } from "expo-router";
import { keys, useApi } from "@rh/app-core";
import {
  byRoomName,
  extraPersonNote,
  formatMoney,
  roomStatusLabel,
  type Room,
} from "@rh/shared";
import { client, useAuth } from "../../src/api/session";
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

  /**
   * Sorted here, and this is the one screen where that is right.
   *
   * The day sheet must *not* sort — the API orders that route and a second
   * opinion would undo it. This route sends creation order, which puts
   * "10 Bakul" between "1 Camellia" and "2 Lotus" on a plain string sort
   * and nowhere sensible at all unsorted.
   */
  const rooms = useMemo(() => [...(list.data ?? [])].sort(byRoomName), [list.data]);

  const header = <Stack.Screen options={{ title: "Rooms & rates" }} />;

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

  /** The row as one sentence — see `Stat` for why. */
  const spoken = `${room.name}, ${rate} a night, ${roomStatusLabel(room.status).toLowerCase()}${
    extra ? `, takes ${extra}` : ""
  }`;

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
  shut: {
    backgroundColor: color.warn.bg,
    borderWidth: 1,
    borderColor: color.warn.line,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
});
