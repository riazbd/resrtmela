/**
 * Which rooms are ready, and which one to clean next.
 *
 * **The first screen in this app where the phone is the primary client
 * and the console is the copy.** A housekeeper is not at a desk; they
 * are on the second floor holding a mop. Everything here follows from
 * that: one list, the urgent room at the top, one tap to move a room on,
 * and nothing else on the screen at all.
 *
 * `HOUSEKEEPING` has been a role since phase 0 and `permissionsFor`
 * answered it with an empty array — so an owner could add a
 * housekeeper, hand them a password, and that person signed in to an
 * app with no screens in it. This is the first one they can open.
 *
 * The order and the words are `@rh/shared`'s. `housekeepingOrder` puts
 * the room somebody left this morning, with somebody arriving into it
 * tonight, first; `nextHousekeepingState` gives the button the state it
 * moves *to*, which `room-status.ts` records getting backwards.
 */
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { useApi } from "@rh/app-core";
import {
  dayLabel,
  housekeepingLabel,
  housekeepingOrder,
  nextHousekeepingState,
  type HousekeepingRow,
} from "@rh/shared";
import { client, useAuth } from "../../../src/api/session";
import { WhichResort } from "../../../src/screens/which-resort";
import { Button } from "../../../src/design/button";
import { Empty, Loading, Problem, Stale } from "../../../src/design/states";
import { Card, Row, Stat } from "../../../src/design/surface";
import { Text } from "../../../src/design/text";
import { space } from "../../../src/design/tokens";

export default function HousekeepingScreen() {
  const { activeResort, can } = useAuth();
  const resortId = activeResort?.id;
  const mayMove = can("housekeeping.manage");
  const [busy, setBusy] = useState<number | null>(null);
  const [refused, setRefused] = useState<string | null>(null);

  const list = useApi<HousekeepingRow[]>(
    ["housekeeping", resortId],
    () => client.rooms.housekeeping(resortId!),
    { enabled: resortId !== undefined },
  );

  const header = <Stack.Screen options={{ title: "Housekeeping" }} />;

  async function move(room: HousekeepingRow) {
    const next = nextHousekeepingState(room.housekeeping);
    setRefused(null);
    setBusy(room.id);
    try {
      await client.rooms.setHousekeeping(room.id, next.to);
      await list.refetch();
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That did not go through.");
    } finally {
      setBusy(null);
    }
  }

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

  const rows = housekeepingOrder(list.data);
  const toClean = rows.filter((r) => r.housekeeping === "DIRTY").length;
  const underway = rows.filter((r) => r.housekeeping === "CLEANING").length;
  const ready = rows.filter((r) => r.housekeeping === "CLEAN").length;

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
        <View style={styles.figures}>
          <Stat
            label="To clean"
            value={String(toClean)}
            sub={underway > 0 ? `${underway} underway` : "rooms waiting"}
            tone={toClean > 0 ? "danger" : "ok"}
          />
          <Stat label="Ready" value={String(ready)} sub="can be sold" tone="ok" />
        </View>

        {rows.length === 0 ? (
          <View style={styles.middle}>
            <Empty
              message="No rooms"
              hint="Add the resort's rooms and they appear here to be cleaned."
            />
          </View>
        ) : toClean === 0 && underway === 0 ? (
          <View style={styles.middle}>
            {/* a zero with no sentence beside it reads as a screen that
                failed to load, not as a morning's work finished */}
            <Empty
              message="Everything is ready"
              hint="Every room has been cleaned. The list fills again as guests leave."
            />
          </View>
        ) : null}

        {rows.length > 0 ? (
          <Card title="Every room">
            {rows.map((room, i) => (
              <RoomRow
                key={room.id}
                room={room}
                last={i === rows.length - 1}
                mayMove={mayMove}
                busy={busy === room.id}
                onMove={() => void move(room)}
              />
            ))}
          </Card>
        ) : null}

        {refused ? (
          <Text step="small" tone="danger" weight="medium" style={styles.refused}>
            {refused}
          </Text>
        ) : null}
      </ScrollView>
    </>
  );
}

function RoomRow({
  room,
  last,
  mayMove,
  busy,
  onMove,
}: {
  room: HousekeepingRow;
  last: boolean;
  mayMove: boolean;
  busy: boolean;
  onMove: () => void;
}) {
  const state = housekeepingLabel(room.housekeeping);
  const next = nextHousekeepingState(room.housekeeping);
  const dirty = room.housekeeping === "DIRTY";

  /**
   * Why this room is where it is in the list.
   *
   * The ordering alone is silent — somebody scrolling past the third
   * row cannot tell why the first one was first. Saying it costs a
   * line and saves the question.
   */
  const why = dirty
    ? room.departedToday && room.arrivingToday
      ? "Left this morning, someone arriving tonight"
      : room.departedToday
        ? "Left this morning"
        : null
    : null;

  // who last moved it, and only where a person did: a check-out marks
  // the room and no person did that
  const bywhom = room.housekeepingBy
    ? `${room.housekeepingBy}${room.housekeepingAt ? ` · ${dayLabel(room.housekeepingAt, { style: "short" })}` : ""}`
    : null;

  return (
    <Row
      title={room.name}
      subtitle={why ?? room.roomTypeName ?? undefined}
      /**
       * The state is said once. With a button the right-hand side is the
       * button, so the state goes here; without one the right-hand side
       * *is* the state and repeating it here is a row saying "Needs
       * cleaning · Needs cleaning".
       */
      meta={[mayMove ? state : null, bywhom, room.status === "ACTIVE" ? null : "out of service"]
        .filter(Boolean)
        .join(" · ")}
      last={last}
      accessibilityLabel={`${room.name}, ${state}${why ? `, ${why}` : ""}`}
      right={
        mayMove ? (
          <Button
            label={next.label}
            kind={dirty ? "primary" : "ghost"}
            block={false}
            loading={busy}
            onPress={onMove}
          />
        ) : (
          <Text step="small" weight="medium" tone={dirty ? "danger" : "muted"}>
            {state}
          </Text>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  figures: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  middle: { paddingVertical: space.lg },
  refused: { textAlign: "center" },
});
