/**
 * Rate plans: what a room type costs in a season.
 *
 * A plan overrides the room's base rate for the nights it covers, and
 * `effectiveRates` in the API averages whatever applies to each night of
 * a stay. That is why a booking quoted in December can price differently
 * from the same room in June without anybody touching a room.
 *
 * The screen is read-and-add rather than read-and-edit, and that split is
 * deliberate: adding a season is a thing an owner does standing in the
 * lobby in October, and editing one that is already selling changes what
 * *future* bookings cost while leaving every booking already taken at the
 * price it was quoted. That asymmetry is confusing enough on a wide
 * screen with the whole calendar visible.
 */
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { keys, useApi } from "@rh/app-core";
import { dayLabel, formatMoney, stayRange, type RatePlan, type RoomType } from "@rh/shared";
import { client, useAuth } from "../../../../src/api/session";
import { WhichResort } from "../../../../src/screens/which-resort";
import { Button } from "../../../../src/design/button";
import { Chip } from "../../../../src/design/chip";
import { DateNav } from "../../../../src/design/date-nav";
import { Field, Input } from "../../../../src/design/input";
import { useMoneyFormat } from "../../../../src/design/money";
import { Empty, Loading, Problem } from "../../../../src/design/states";
import { Card, Row } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { useAction } from "../../../../src/design/use-action";
import { addDaysIso, todayIn } from "@rh/shared";
import { color, radius, space } from "../../../../src/design/tokens";

export default function RatePlansScreen() {
  const { activeResort, can } = useAuth();
  const resortId = activeResort?.id;
  const money = useMoneyFormat();
  const whole = (n: number | string) => formatMoney(n, { ...money, decimals: 0 });

  const plans = useApi<RatePlan[]>(
    keys.ratePlans(resortId),
    () => client.rooms.ratePlans(resortId!),
    { enabled: resortId !== undefined },
  );
  const types = useApi<RoomType[]>(
    keys.roomTypes(resortId),
    () => client.rooms.types(resortId!),
    { enabled: resortId !== undefined, staleTime: 3_600_000 },
  );

  const [type, setType] = useState<number | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [price, setPrice] = useState(0);
  const [tried, setTried] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const today = todayIn(activeResort?.timezone);
  const dateFrom = from ?? today;
  const dateTo = to ?? addDaysIso(dateFrom, 30);

  const mayEdit = can("rooms.manage");
  const incomplete = !type || !(price > 0);

  const add = useAction(async () => {
    if (incomplete) {
      setTried(true);
      return;
    }
    setRefused(null);
    try {
      await client.rooms.createRatePlan(resortId!, {
        roomTypeId: type,
        dateFrom,
        dateTo,
        price,
        active: true,
      });
      setPrice(0);
      setTried(false);
      setAdding(false);
      await plans.refetch();
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That did not go through.");
    }
  });

  const header = <Stack.Screen options={{ title: "Rate plans" }} />;

  if (resortId === undefined) {
    return (
      <>
        {header}
        <WhichResort what="the rate plans" />
      </>
    );
  }

  if (plans.error && !plans.data) {
    return (
      <>
        {header}
        <Problem error={plans.error} onRetry={() => void plans.refetch()} />
      </>
    );
  }

  if (!plans.data) {
    return (
      <>
        {header}
        <Loading what="the rate plans" />
      </>
    );
  }

  const rows = plans.data;
  const nameOf = (id: number) => types.data?.find((t) => t.id === id)?.name ?? `Type ${id}`;

  return (
    <>
      {header}
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={plans.isRefetching} onRefresh={() => void plans.refetch()} />
        }
      >
        <Card
          title="Seasons"
          action={
            mayEdit ? (
              <Button
                label={adding ? "Close" : "Add"}
                kind="ghost"
                block={false}
                onPress={() => setAdding((open) => !open)}
              />
            ) : undefined
          }
        >
          {rows.length === 0 ? (
            <View style={styles.emptyBox}>
              <Empty
                message="No rate plans"
                hint="Every room sells at its own base rate until a season says otherwise."
              />
            </View>
          ) : (
            rows.map((plan, i) => (
              <Row
                key={plan.id}
                title={plan.roomType?.name ?? nameOf(plan.roomTypeId)}
                subtitle={stayRange(plan.dateFrom, plan.dateTo)}
                last={i === rows.length - 1}
                accessibilityLabel={`${plan.roomType?.name ?? nameOf(plan.roomTypeId)}, ${stayRange(plan.dateFrom, plan.dateTo)}, ${whole(plan.price)} a night${plan.active ? "" : ", not in use"}`}
                right={
                  <View style={styles.right}>
                    <Text step="body" weight="medium" tone={plan.active ? "title" : "muted"} tabular>
                      {whole(plan.price)}
                    </Text>
                    {plan.active ? null : (
                      <Text step="caption" tone="muted">
                        off
                      </Text>
                    )}
                  </View>
                }
              />
            ))
          )}
        </Card>

        {adding && mayEdit ? (
          <Card title="A new season">
            <View style={styles.fields}>
              {types.data && types.data.length > 0 ? (
                <View style={styles.kinds}>
                  {types.data
                    .filter((t) => t.active)
                    .map((t) => (
                      <Chip
                        key={t.id}
                        label={t.name}
                        on={type === t.id}
                        onPress={() => {
                          setType(t.id);
                          setTried(false);
                        }}
                      />
                    ))}
                </View>
              ) : (
                <Loading what="the room types" />
              )}

              <DateNav
                what="From"
                home={false}
                value={dateFrom}
                timezone={activeResort?.timezone}
                onChange={(day) => {
                  setFrom(day);
                  // a season that ends before it starts is not a season
                  if (to && day >= to) setTo(addDaysIso(day, 1));
                }}
              />
              <DateNav
                what="To"
                home={false}
                value={dateTo}
                timezone={activeResort?.timezone}
                onChange={(day) => (day > dateFrom ? setTo(day) : undefined)}
              />

              <Field label="Price a night">
                <Input
                  value={price ? String(price) : ""}
                  onChangeText={(text) => {
                    const next = Number(text.replace(/[^0-9.]/g, "")) || 0;
                    setPrice(next);
                    if (next > 0) setTried(false);
                  }}
                  placeholder="0"
                  keyboardType="numeric"
                  invalid={tried && !(price > 0)}
                />
              </Field>

              {tried && incomplete ? (
                <Text step="small" tone="danger" weight="medium">
                  Pick a room type and say what it costs.
                </Text>
              ) : null}

              {refused ? (
                <View style={styles.refused}>
                  <Text step="small" tone="danger" weight="medium">
                    {refused}
                  </Text>
                </View>
              ) : null}

              <Button label="Add the season" loading={add.busy} onPress={add.go} />
            </View>
          </Card>
        ) : null}

        <Text step="caption" tone="muted" style={styles.footnote}>
          A season overrides the room&apos;s base rate for the nights it covers.
          Bookings already taken keep the price they were quoted.
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  fields: { gap: space.md },
  kinds: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  right: { alignItems: "flex-end", gap: 2 },
  emptyBox: { paddingVertical: space.lg },
  footnote: { textAlign: "center" },
  refused: {
    backgroundColor: color.danger.bg,
    borderWidth: 1,
    borderColor: color.danger.line,
    borderRadius: radius.md,
    padding: space.md,
  },
});
