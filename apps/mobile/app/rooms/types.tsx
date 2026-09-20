/**
 * The kinds of room a resort has.
 *
 * Read-only on the phone, deliberately. A type is a structural decision —
 * renaming one or changing what it sleeps moves every room under it and
 * every future booking's occupancy check — and it is made once, at a desk,
 * not from a phone between guests. What the phone needs is the answer to
 * "what does a Deluxe sleep", which is asked at the counter all the time.
 *
 * `extraPersonAllowed` is shown as the type's *default*, and said to be
 * one, because it is the value a new room is seeded with and not the value
 * any existing room is charged at. A clerk reading this as the price would
 * quote the wrong figure for half the rooms in a type.
 */
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { keys, useApi } from "@rh/app-core";
import { formatMoney, type RoomType } from "@rh/shared";
import { client, useAuth } from "../../src/api/session";
import { useMoneyFormat } from "../../src/design/money";
import { Empty, Loading, Problem } from "../../src/design/states";
import { Card, Row } from "../../src/design/surface";
import { Text } from "../../src/design/text";
import { color, radius, space } from "../../src/design/tokens";

export default function RoomTypesScreen() {
  const { activeResort } = useAuth();
  const resortId = activeResort?.id;
  const money = useMoneyFormat();

  const types = useApi(keys.roomTypes(resortId), () => client.rooms.types(resortId!), {
    enabled: resortId !== undefined,
  });

  const header = <Stack.Screen options={{ title: "Room types" }} />;

  if (types.error && !types.data) {
    return (
      <>
        {header}
        <Problem error={types.error} onRetry={() => void types.refetch()} />
      </>
    );
  }

  if (!types.data) {
    return (
      <>
        {header}
        <Loading what="the room types" />
      </>
    );
  }

  const rows = types.data;

  return (
    <>
      {header}
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={
          <RefreshControl refreshing={types.isRefetching} onRefresh={() => void types.refetch()} />
        }
      >
        {rows.length === 0 ? (
          <Card>
            <View style={styles.emptyBox}>
              <Empty
                message="No room types yet"
                hint="Room types are set up on the desk; the rooms under them appear here."
              />
            </View>
          </Card>
        ) : (
          rows.map((type) => <TypeCard key={type.id} type={type} money={money} />)
        )}

        <Text step="caption" tone="muted" style={styles.footnote}>
          Types are changed on the desk. Changing one moves every room under it.
        </Text>
      </ScrollView>
    </>
  );
}

function TypeCard({
  type,
  money,
}: {
  type: RoomType;
  money: Parameters<typeof formatMoney>[1];
}) {
  const sleeps = `${type.maxAdults} adult${type.maxAdults === 1 ? "" : "s"}, ${type.maxChildren} child${type.maxChildren === 1 ? "" : "ren"}`;

  return (
    <Card title={type.name}>
      {type.active ? null : (
        <View style={styles.retired}>
          <Text step="caption" weight="medium" tone="warn">
            Retired — no new rooms take this type
          </Text>
        </View>
      )}
      <Row title="Sleeps" meta={sleeps} accessibilityLabel={`${type.name} sleeps ${sleeps}`} />
      <Row
        title="Extra person"
        // the type's default, not any room's price: each room carries its own
        meta={
          type.extraPersonAllowed
            ? `${formatMoney(type.extraPersonRate ?? 0, { ...money, decimals: 0 })} by default`
            : "Not by default"
        }
        last={!type.amenities || type.amenities.length === 0}
        accessibilityLabel={
          type.extraPersonAllowed
            ? `Extra person, ${formatMoney(type.extraPersonRate ?? 0, { ...money, decimals: 0 })} by default — each room carries its own`
            : "Extra person not allowed by default"
        }
      />
      {type.amenities && type.amenities.length > 0 ? (
        <Row
          title="Amenities"
          subtitle={type.amenities.join(", ")}
          last
          accessibilityLabel={`Amenities: ${type.amenities.join(", ")}`}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  emptyBox: { paddingVertical: space.lg },
  footnote: { textAlign: "center" },
  retired: {
    alignSelf: "flex-start",
    backgroundColor: color.warn.bg,
    borderWidth: 1,
    borderColor: color.warn.line,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    marginBottom: space.sm,
  },
});
