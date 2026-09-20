/**
 * One room: what it is, and the two things a manager changes about it.
 *
 * The console has a dialog for the whole room and a separate button for
 * the status. On a phone both live here, because a pushed screen is the
 * phone's dialog and there is nowhere else for them to be.
 *
 * "Out of service" is the one that matters operationally: a room under
 * repair that still looks sellable is a room somebody books a guest into.
 * It sits under its own heading rather than among the fields, because it
 * is not a detail of the room — it is whether the room exists this week.
 */
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { keys, useApi, useQueryClient } from "@rh/app-core";
import {
  extraPersonNote,
  formatMoney,
  nextRoomStatus,
  roomStatusLabel,
  type Room,
} from "@rh/shared";
import { client, useAuth } from "../../../../src/api/session";
import { WhichResort } from "../../../../src/screens/which-resort";
import { Button } from "../../../../src/design/button";
import { Counter } from "../../../../src/design/counter";
import { Field, Input } from "../../../../src/design/input";
import { useMoneyFormat } from "../../../../src/design/money";
import { Empty, Loading, Problem } from "../../../../src/design/states";
import { Card, Row } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { Toggle } from "../../../../src/design/toggle";
import { useAction } from "../../../../src/design/use-action";
import { color, radius, space } from "../../../../src/design/tokens";

export default function RoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const roomId = Number(id);
  const { activeResort, can } = useAuth();
  const resortId = activeResort?.id;
  const money = useMoneyFormat();
  const qc = useQueryClient();

  /**
   * Read off the resort's list rather than a route of its own.
   *
   * There is no `GET /rooms/:id`; the console has never needed one, and
   * adding a route to the API to save one filter would be the wrong way
   * round. The list is already in the cache from the tab that pushed here,
   * so this draws instantly.
   */
  const list = useApi(keys.rooms(resortId), () => client.rooms.list(resortId!), {
    enabled: resortId !== undefined,
  });
  const room = list.data?.find((r) => r.id === roomId);

  const header = <Stack.Screen options={{ title: room?.name ?? "Room" }} />;

  if (resortId === undefined) {
    return (
      <>
        {header}
        <WhichResort what="the room" />
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
        <Loading what="the room" />
      </>
    );
  }

  if (!room) {
    return (
      <>
        {header}
        <View style={styles.middle}>
          <Empty
            message="Room not found"
            hint="It may have been removed since this screen was opened."
          />
          <Button label="Back to rooms" kind="ghost" onPress={() => router.replace("/rooms")} />
        </View>
      </>
    );
  }

  return (
    <>
      {header}
      <Detail
        room={room}
        money={money}
        mayEdit={can("rooms.manage")}
        refreshing={list.isRefetching}
        onRefresh={() => void list.refetch()}
        reload={async () => {
          await list.refetch();
          // the availability grid and the day sheet both draw this room
          await Promise.all([
            qc.invalidateQueries({ queryKey: ["availability"] }),
            qc.invalidateQueries({ queryKey: ["day-sheet"] }),
          ]);
        }}
      />
    </>
  );
}

function Detail({
  room,
  money,
  mayEdit,
  refreshing,
  onRefresh,
  reload,
}: {
  room: Room;
  money: Parameters<typeof formatMoney>[1];
  mayEdit: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  reload: () => Promise<void>;
}) {
  const [rate, setRate] = useState(String(Number(room.baseRate)));
  const [allowed, setAllowed] = useState(Boolean(room.extraPersonAllowed));
  const [max, setMax] = useState(room.extraPersonMax ?? 0);
  const [extraRate, setExtraRate] = useState(String(Number(room.extraPersonRate ?? 0)));
  const [refused, setRefused] = useState<string | null>(null);

  const shut = room.status !== "ACTIVE";
  const move = nextRoomStatus(room.status);

  const num = (text: string) => Number(text.replace(/[^0-9.]/g, "")) || 0;

  const save = useAction(async () => {
    setRefused(null);
    const body: Record<string, unknown> = {};
    if (num(rate) !== Number(room.baseRate)) body.baseRate = num(rate);
    if (allowed !== Boolean(room.extraPersonAllowed)) body.extraPersonAllowed = allowed;
    if (allowed) {
      if (max !== (room.extraPersonMax ?? 0)) body.extraPersonMax = max;
      if (num(extraRate) !== Number(room.extraPersonRate ?? 0)) body.extraPersonRate = num(extraRate);
    }
    if (Object.keys(body).length === 0) {
      router.back();
      return;
    }
    try {
      await client.rooms.update(room.id, body);
      await reload();
      router.back();
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That did not go through.");
    }
  });

  const flip = useAction(async () => {
    setRefused(null);
    try {
      await client.rooms.update(room.id, { status: move.to });
      await reload();
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That did not go through.");
    }
  });

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Card>
        <Row title="Type" meta={room.roomType?.name ?? "—"} accessibilityLabel={`Type: ${room.roomType?.name ?? "none"}`} />
        <Row
          title="Sleeps"
          meta={
            room.roomType
              ? `${room.roomType.maxAdults} adult${room.roomType.maxAdults === 1 ? "" : "s"}, ${room.roomType.maxChildren} child${room.roomType.maxChildren === 1 ? "" : "ren"}`
              : "—"
          }
          accessibilityLabel={`Sleeps ${room.roomType?.maxAdults ?? 0} adults and ${room.roomType?.maxChildren ?? 0} children`}
        />
        <Row
          title="Extra persons"
          meta={extraPersonNote(room, money) ?? "None"}
          last
          accessibilityLabel={`Extra persons: ${extraPersonNote(room, money) ?? "none"}`}
        />
      </Card>

      <Card title="Whether it can be sold">
        <View style={styles.fields}>
          <View style={shut ? styles.shutBox : styles.openBox}>
            <Text step="body" weight="medium" tone={shut ? "warn" : "ok"}>
              {roomStatusLabel(room.status)}
            </Text>
            <Text step="caption" tone="muted">
              {shut
                ? "It stays on the grid so the desk can see it, and cannot be booked."
                : "It appears on the booking form and the availability grid."}
            </Text>
          </View>
          {mayEdit ? (
            // the label is where it goes, not where it is — see `nextRoomStatus`
            <Button label={move.label} kind={shut ? "primary" : "subtle"} loading={flip.busy} onPress={flip.go} />
          ) : null}
        </View>
      </Card>

      {mayEdit ? (
        <>
          <Card title="What it costs">
            <View style={styles.fields}>
              <Field label="Base rate a night" hint="Before any seasonal rate plan">
                <Input value={rate} onChangeText={setRate} keyboardType="numeric" placeholder="0" />
              </Field>
            </View>
          </Card>

          <Card title="Extra persons">
            <View style={styles.fields}>
              <Toggle
                label="This room takes an extra person"
                hint="Each room answers for itself — one type covers rooms of different sizes"
                value={allowed}
                onChange={setAllowed}
              />
              {allowed ? (
                <>
                  <Field label="How many">
                    <Counter label="extra place" value={max} onChange={setMax} />
                  </Field>
                  <Field label="Each, per night">
                    <Input
                      value={extraRate}
                      onChangeText={setExtraRate}
                      keyboardType="numeric"
                      placeholder="0"
                    />
                  </Field>
                </>
              ) : null}
            </View>
          </Card>
        </>
      ) : null}

      {refused ? (
        <View style={styles.refused}>
          <Text step="small" tone="danger" weight="medium">
            {refused}
          </Text>
        </View>
      ) : null}

      {mayEdit ? <Button label="Save changes" loading={save.busy} onPress={save.go} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  middle: { flex: 1, justifyContent: "center", alignItems: "center", gap: space.md, padding: space.lg },
  fields: { gap: space.md },
  openBox: {
    gap: 2,
    backgroundColor: color.ok.bg,
    borderWidth: 1,
    borderColor: color.ok.line,
    borderRadius: radius.md,
    padding: space.md,
  },
  shutBox: {
    gap: 2,
    backgroundColor: color.warn.bg,
    borderWidth: 1,
    borderColor: color.warn.line,
    borderRadius: radius.md,
    padding: space.md,
  },
  refused: {
    backgroundColor: color.danger.bg,
    borderWidth: 1,
    borderColor: color.danger.line,
    borderRadius: radius.md,
    padding: space.md,
  },
});
