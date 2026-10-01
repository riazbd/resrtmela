/**
 * Discount offers, applied by themselves at booking — on the phone.
 *
 * The console's "Discounts" tab. Each offer is drawn as what it is, a coupon:
 * the size of the discount large, what it applies to and when, and whether it
 * is on. A new booking without a manual discount gets the best active one.
 */
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { keys, useApi, useQueryClient } from "@rh/app-core";
import { formatMoney, type DiscountOfferListRow, type NewDiscountOffer, type ResortSettings, type Room } from "@rh/shared";
import { client, useAuth } from "../../../../src/api/session";
import { WhichResort } from "../../../../src/screens/which-resort";
import { refusal } from "../../../../src/screens/payroll-month";
import { Button } from "../../../../src/design/button";
import { Chip } from "../../../../src/design/chip";
import { Field, Input } from "../../../../src/design/input";
import { useMoneyFormat } from "../../../../src/design/money";
import { Empty, Loading, Problem } from "../../../../src/design/states";
import { Card } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { useAction } from "../../../../src/design/use-action";
import { color, elevation, radius, space } from "../../../../src/design/tokens";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const dmy = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null);

export default function DiscountsScreen() {
  const { activeResort } = useAuth();
  const rid = activeResort?.id;
  const qc = useQueryClient();
  const money = useMoneyFormat();
  const whole = (n: number) => formatMoney(n, { ...money, decimals: 0 });

  const offers = useApi<DiscountOfferListRow[]>(["discounts", rid], () => client.discounts.list(rid!), { enabled: rid !== undefined });
  const rooms = useApi<Room[]>(keys.rooms(rid), () => client.rooms.list(rid!), { enabled: rid !== undefined });
  const resort = useApi<ResortSettings>(keys.resort(rid), () => client.resort.get(rid!), { enabled: rid !== undefined });

  const [scope, setScope] = useState<NewDiscountOffer["scope"]>("RESORT");
  const [target, setTarget] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<NewDiscountOffer["kind"]>("PERCENT");
  const [value, setValue] = useState("5");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [refused, setRefused] = useState<string | null>(null);

  const reload = () => qc.invalidateQueries({ queryKey: ["discounts", rid] });

  const create = useAction(async () => {
    setRefused(null);
    if (!name.trim()) return setRefused("Give the offer a name.");
    if ((from && !DAY.test(from)) || (until && !DAY.test(until))) return setRefused("Dates look like 2026-12-31.");
    if (scope !== "RESORT" && target == null) return setRefused(scope === "ROOM" ? "Choose the room." : "Choose the room type.");
    try {
      await client.discounts.create(rid!, {
        scope,
        roomTypeId: scope === "ROOM_TYPE" ? target! : undefined,
        roomId: scope === "ROOM" ? target! : undefined,
        name: name.trim(),
        kind,
        value: Number(value),
        validFrom: from || undefined,
        validTo: until || undefined,
      });
      setName("");
      setValue("5");
      setFrom("");
      setUntil("");
      await reload();
    } catch (e) {
      setRefused(refusal(e));
    }
  });

  const header = <Stack.Screen options={{ title: "Discounts" }} />;
  if (rid === undefined) return (<>{header}<WhichResort /></>);
  if (offers.error && !offers.data) return (<>{header}<Problem error={offers.error} onRetry={() => void offers.refetch()} /></>);
  if (!offers.data) return (<>{header}<Loading what="the offers" /></>);

  const toggle = (o: DiscountOfferListRow) =>
    client.discounts.update(o.id, { active: !o.active }).then(reload).catch((e) => setRefused(refusal(e)));

  const types = resort.data?.roomTypes ?? [];
  const choices = scope === "ROOM" ? (rooms.data ?? []).map((r) => ({ id: r.id, name: r.name })) : types.map((t) => ({ id: t.id, name: t.name }));

  return (
    <>
      {header}
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={offers.isRefetching} onRefresh={() => void offers.refetch()} />}
      >
        {offers.data.length === 0 ? (
          <Card>
            <Empty message="No offers yet" hint="Bookings get no automatic discount until there is one." />
          </Card>
        ) : (
          offers.data.map((o) => (
            <View key={o.id} style={[styles.coupon, o.active ? null : styles.off]} accessible accessibilityLabel={`${o.name}, ${o.kind === "PERCENT" ? `${Number(o.value)}%` : whole(Number(o.value))} off, ${o.active ? "on" : "off"}`}>
              <View style={styles.stub}>
                <Text step="figure" weight="bold" tone="onBrand" tabular numberOfLines={1} adjustsFontSizeToFit>
                  {o.kind === "PERCENT" ? `${Number(o.value)}%` : whole(Number(o.value))}
                </Text>
                <Text step="caption" weight="bold" tone="onBrand">
                  OFF
                </Text>
              </View>
              <View style={styles.cut} />
              <View style={styles.body}>
                <Text step="strong" weight="bold" tone="title" numberOfLines={1}>
                  {o.name}
                </Text>
                <Text step="small" tone="body" numberOfLines={1}>
                  {o.scope === "RESORT" ? "Every room" : o.scope === "ROOM" ? `Room ${o.room?.name ?? o.roomId}` : (o.roomType?.name ?? "A room type")}
                </Text>
                <Text step="caption" tone="muted" numberOfLines={1}>
                  {`${dmy(o.validFrom) ?? "Always"} → ${dmy(o.validTo) ?? "always"}`}
                </Text>
                <View style={styles.row}>
                  <Text step="caption" weight="bold" tone={o.active ? "ok" : "muted"}>
                    {o.active ? "● On" : "○ Off"}
                  </Text>
                  <Button label={o.active ? "Turn off" : "Turn on"} kind="ghost" block={false} onPress={() => void toggle(o)} />
                </View>
              </View>
            </View>
          ))
        )}

        <Card title="A new offer">
          <View style={styles.fields}>
            <Text step="small" weight="medium" tone="title">
              Applies to
            </Text>
            <View style={styles.chips}>
              <Chip label="Every room" on={scope === "RESORT"} onPress={() => { setScope("RESORT"); setTarget(null); }} />
              <Chip label="A room type" on={scope === "ROOM_TYPE"} onPress={() => { setScope("ROOM_TYPE"); setTarget(null); }} />
              <Chip label="One room" on={scope === "ROOM"} onPress={() => { setScope("ROOM"); setTarget(null); }} />
            </View>
            {scope !== "RESORT" ? (
              <View style={styles.chips}>
                {choices.map((c) => (
                  <Chip key={c.id} label={c.name} on={target === c.id} onPress={() => setTarget(c.id)} />
                ))}
              </View>
            ) : null}
            <Field label="Name">
              <Input value={name} onChangeText={setName} placeholder="Opening offer" />
            </Field>
            <View style={styles.chips}>
              <Chip label="Percent" on={kind === "PERCENT"} onPress={() => setKind("PERCENT")} />
              <Chip label="Flat amount" on={kind === "FLAT"} onPress={() => setKind("FLAT")} />
            </View>
            <Field label={kind === "PERCENT" ? "Percent" : "Amount"}>
              <Input value={value} onChangeText={setValue} keyboardType="numeric" />
            </Field>
            <Field label="From" hint="Empty for always">
              <Input value={from} onChangeText={setFrom} placeholder="2026-12-01" />
            </Field>
            <Field label="Until" hint="Empty for always">
              <Input value={until} onChangeText={setUntil} placeholder="2026-12-31" />
            </Field>
            {refused ? (
              <Text step="small" tone="danger" weight="medium">
                {refused}
              </Text>
            ) : null}
            <Button label="Create the offer" loading={create.busy} onPress={create.go} />
          </View>
        </Card>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  fields: { gap: space.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  coupon: {
    flexDirection: "row",
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: color.ink[100],
    ...elevation.raised,
  },
  off: { opacity: 0.6 },
  stub: {
    width: 104,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.brand[600],
    paddingHorizontal: space.sm,
    paddingVertical: space.lg,
  },
  cut: { width: 0, borderLeftWidth: 2, borderStyle: "dashed", borderColor: color.ink[300] },
  body: { flex: 1, padding: space.md, gap: 2 },
});
