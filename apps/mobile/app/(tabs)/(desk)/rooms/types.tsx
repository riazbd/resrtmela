/**
 * The kinds of room a resort has, and setting them up.
 *
 * This was read-only until 2026-09-21, on the reasoning that a type is a
 * structural decision made once at a desk. The reasoning was sound and
 * the conclusion was wrong for the people actually using this: an owner
 * opening a new resort has the phone in their hand and the rooms in
 * front of them, and telling them to find a laptop is telling them the
 * software does not work yet.
 *
 * What the caution was right about is kept. Changing a type moves every
 * room under it, so the form says so where it can be read before the
 * save rather than after it.
 *
 * `extraPersonAllowed` is shown as the type's *default*, and said to be
 * one, because it is the value a new room is seeded with and not the value
 * any existing room is charged at. A clerk reading this as the price would
 * quote the wrong figure for half the rooms in a type. It is shown and not
 * edited for the same reason — the console's form leaves it out too, and
 * says why: one type covers rooms of different sizes.
 *
 * Amenities are set when a type is made and not afterwards, which is the
 * API's shape rather than this screen's: `UpdateRoomTypeDto` has no
 * `amenities`, so the console cannot change them either.
 */
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { keys, useApi, useQueryClient } from "@rh/app-core";
import { formatMoney, type NewRoomType, type RoomType } from "@rh/shared";
import { client, useAuth } from "../../../../src/api/session";
import { WhichResort } from "../../../../src/screens/which-resort";
import { Button } from "../../../../src/design/button";
import { Counter } from "../../../../src/design/counter";
import { Field, Input } from "../../../../src/design/input";
import { useMoneyFormat } from "../../../../src/design/money";
import { Empty, Loading, Problem } from "../../../../src/design/states";
import { Card, Row } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { useAction } from "../../../../src/design/use-action";
import { color, radius, space } from "../../../../src/design/tokens";

export default function RoomTypesScreen() {
  const { activeResort, can } = useAuth();
  const resortId = activeResort?.id;
  const money = useMoneyFormat();
  const qc = useQueryClient();
  const mayManage = can("rooms.manage");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);

  const types = useApi(keys.roomTypes(resortId), () => client.rooms.types(resortId!), {
    enabled: resortId !== undefined,
  });

  /**
   * Everything that reads a room type, not just this list.
   *
   * A type's name is on the room list, the booking form's room picker and
   * the availability grid. Refetching only this screen leaves the name a
   * clerk just corrected still wrong on the screen they go to next.
   */
  const settled = async () => {
    await types.refetch();
    await qc.invalidateQueries({ queryKey: ["rooms"] });
  };

  const header = <Stack.Screen options={{ title: "Room types" }} />;

  if (resortId === undefined) {
    return (
      <>
        {header}
        <WhichResort what="the room types" />
      </>
    );
  }

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
        {rows.length === 0 && !adding ? (
          <Card>
            <View style={styles.emptyBox}>
              <Empty
                message="No room types yet"
                hint={
                  mayManage
                    ? "Every room belongs to a type, so this is the first thing to set up."
                    : "Ask the owner to set them up; the rooms under them appear here."
                }
              />
            </View>
          </Card>
        ) : (
          rows.map((type) =>
            editing === type.id ? (
              <TypeForm
                key={type.id}
                title={type.name}
                type={type}
                onClose={() => setEditing(null)}
                onSaved={async () => {
                  setEditing(null);
                  await settled();
                }}
              />
            ) : (
              <TypeCard
                key={type.id}
                type={type}
                money={money}
                onEdit={mayManage ? () => setEditing(type.id) : undefined}
              />
            ),
          )
        )}

        {adding ? (
          <TypeForm
            title="A new type"
            resortId={resortId}
            onClose={() => setAdding(false)}
            onSaved={async () => {
              setAdding(false);
              await settled();
            }}
          />
        ) : mayManage ? (
          <Button label="Add a room type" kind="ghost" onPress={() => setAdding(true)} />
        ) : null}

        <Text step="caption" tone="muted" style={styles.footnote}>
          Changing a type moves every room under it. What an extra person costs
          is set on each room, not here — one type covers rooms of different
          sizes.
        </Text>
      </ScrollView>
    </>
  );
}

function TypeCard({
  type,
  money,
  onEdit,
}: {
  type: RoomType;
  money: Parameters<typeof formatMoney>[1];
  /** Absent for somebody without `rooms.manage`, who is reading rather than setting up. */
  onEdit?: () => void;
}) {
  const sleeps = `${type.maxAdults} adult${type.maxAdults === 1 ? "" : "s"}, ${type.maxChildren} child${type.maxChildren === 1 ? "" : "ren"}`;

  return (
    <Card
      title={type.name}
      action={
        onEdit ? (
          <Button
            label="Edit"
            kind="ghost"
            block={false}
            accessibilityLabel={`Edit ${type.name}`}
            onPress={onEdit}
          />
        ) : undefined
      }
    >
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

/**
 * One type, being written or corrected.
 *
 * The same form both ways, because the fields are the same fields and two
 * of them would drift. `resortId` decides which call it makes: a form
 * with a resort creates, a form with a type edits. Exactly one is passed.
 *
 * **What a type does not carry is extra persons**, and that is the
 * console's decision rather than a gap here. `RoomType` has the columns
 * and the console's own form leaves them out, in as many words: *one type
 * covers rooms of different sizes, so a single answer described none of
 * them.* The value lives on each room, seeded from the type when the room
 * is made, and the room's own screen is where it is changed. Offering it
 * here would invite an owner to change a number that governs nothing they
 * already own.
 *
 * Amenities are on the create form and not the edit one, which is the
 * API's shape: `UpdateRoomTypeDto` has no `amenities`, so the console
 * cannot change them either.
 */
function TypeForm({
  title,
  type,
  resortId,
  onClose,
  onSaved,
}: {
  title: string;
  type?: RoomType;
  resortId?: number;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(type?.name ?? "");
  const [adults, setAdults] = useState(type?.maxAdults ?? 2);
  const [children, setChildren] = useState(type?.maxChildren ?? 0);
  const [amenities, setAmenities] = useState("");
  const [tried, setTried] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const incomplete = !name.trim();

  const save = useAction(async () => {
    if (incomplete) {
      setTried(true);
      return;
    }
    setRefused(null);
    try {
      if (type) {
        await client.rooms.updateType(type.id, {
          name: name.trim(),
          maxAdults: adults,
          maxChildren: children,
        });
      } else {
        const list = amenities
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean);
        const body: NewRoomType = {
          name: name.trim(),
          maxAdults: adults,
          maxChildren: children,
          ...(list.length > 0 ? { amenities: list } : {}),
        };
        await client.rooms.createType(resortId!, body);
      }
      await onSaved();
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That did not go through.");
    }
  });

  return (
    <Card title={title}>
      <View style={styles.fields}>
        <Field label="Name" error={tried && incomplete ? "A type needs a name." : null}>
          <Input
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (text.trim()) setTried(false);
            }}
            placeholder="Deluxe"
            autoCapitalize="words"
            invalid={tried && incomplete}
          />
        </Field>

        <Field label="Adults" hint="The most this type sleeps before an extra bed">
          <Counter label="adult" min={1} value={adults} onChange={setAdults} />
        </Field>

        <Field label="Children">
          <Counter label="child" min={0} value={children} onChange={setChildren} />
        </Field>

        {/*
          Only on the way in. `UpdateRoomTypeDto` has no `amenities`, so
          there is nothing to send on an edit and the console does not
          offer one either.
        */}
        {type ? null : (
          <Field label="Amenities" hint="Optional, separated by commas">
            <Input
              value={amenities}
              onChangeText={setAmenities}
              placeholder="Sea view, air conditioning"
            />
          </Field>
        )}

        {type ? (
          <Text step="small" tone="warn" weight="medium">
            This moves every room under {type.name}.
          </Text>
        ) : null}

        {refused ? (
          <View style={styles.refused}>
            <Text step="small" tone="danger" weight="medium">
              {refused}
            </Text>
          </View>
        ) : null}

        <Button label="Save" loading={save.busy} onPress={save.go} />
        <Button label="Cancel" kind="ghost" onPress={onClose} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  emptyBox: { paddingVertical: space.lg },
  footnote: { textAlign: "center" },
  fields: { gap: space.md },
  refused: {
    backgroundColor: color.danger.bg,
    borderWidth: 1,
    borderColor: color.danger.line,
    borderRadius: radius.md,
    padding: space.md,
  },
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
