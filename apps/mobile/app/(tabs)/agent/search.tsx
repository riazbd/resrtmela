/**
 * What is free, across every resort this agency sells.
 *
 * The screen an agent uses standing in front of a customer: two dates,
 * one question, and every free room grouped by the resort it is in.
 * Nothing else belongs on it — a filter for room type or a price slider
 * is a desk's idea of helping, and the list is short enough that
 * scrolling beats both.
 *
 * **`agentRate` is absent, not zero, when a resort hides its rates.**
 * `baseRate` is what the guest pays and `agentRate` is what the agency
 * owes the resort; the difference is the business. Showing the guest's
 * price where the cost belongs would have somebody quote at no margin,
 * so an offer that arrives without one says the rate is not shown.
 *
 * Nothing is asked of the server until there are dates to ask about.
 * "Every room, everywhere, forever" is not a question, and a phone on a
 * hill-district connection should not spend a request discovering that.
 */
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { keys, useApi } from "@rh/app-core";
import {
  addDaysIso,
  formatMoney,
  nightsBetweenIso,
  todayIn,
  type AgencyRoomOffer,
} from "@rh/shared";
import { client, useAuth } from "../../../src/api/session";
import { Button } from "../../../src/design/button";
import { DateNav } from "../../../src/design/date-nav";
import { useMoneyFormat } from "../../../src/design/money";
import { Empty, Loading, Problem, Stale } from "../../../src/design/states";
import { Card, Row } from "../../../src/design/surface";
import { Text } from "../../../src/design/text";
import { space } from "../../../src/design/tokens";

export default function RoomSearchScreen() {
  const { me } = useAuth();
  const { resortId: fromDiscover } = useLocalSearchParams<{ resortId?: string }>();
  const resortId = fromDiscover ? Number(fromDiscover) : undefined;
  const money = useMoneyFormat();
  const whole = (n: number) => formatMoney(n, { ...money, decimals: 0 });

  // an agency has no resort, so it has no resort's timezone either; the
  // dates it asks about are its own day
  const today = todayIn(undefined);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDaysIso(today, 1));
  /** What was last asked — not what the pickers currently read. */
  const [asked, setAsked] = useState<{ from: string; to: string } | null>(null);

  const offers = useApi<AgencyRoomOffer[]>(
    keys.agentRooms(asked?.from ?? "", asked?.to ?? "", resortId),
    () => client.agent.rooms({ from: asked!.from, to: asked!.to, resortId }),
    { enabled: Boolean(me) && asked !== null },
  );

  const nights = nightsBetweenIso(from, to);
  const header = <Stack.Screen options={{ title: "Find a room" }} />;

  const rows = offers.data ?? [];
  const free = rows.reduce((n, r) => n + r.rooms.length, 0);

  return (
    <>
      {header}
      <Stale age={offers.stale} />
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={offers.isRefetching}
            onRefresh={() => void offers.refetch()}
          />
        }
      >
        <Card title="The nights">
          <View style={styles.fields}>
            <DateNav
              what="Check-in"
              value={from}
              onChange={(day) => {
                setFrom(day);
                // a departure on or before the arrival is not a stay
                if (day >= to) setTo(addDaysIso(day, 1));
              }}
            />
            <DateNav
              what="Check-out"
              home={false}
              value={to}
              onChange={(day) => (day > from ? setTo(day) : undefined)}
            />
            <Text step="caption" tone="muted">
              {nights} night{nights === 1 ? "" : "s"}
            </Text>
            <Button label="Search" onPress={() => setAsked({ from, to })} />
          </View>
        </Card>

        {asked === null ? (
          <View style={styles.middle}>
            <Empty
              message="Choose the nights and search"
              hint="Every resort open to you is looked through at once."
            />
          </View>
        ) : offers.error && !offers.data ? (
          <Problem error={offers.error} onRetry={() => void offers.refetch()} />
        ) : !offers.data ? (
          <Loading what="Looking across your resorts" />
        ) : rows.length === 0 ? (
          <View style={styles.middle}>
            <Empty
              message="Nothing free on those nights"
              hint="Try a different date, or one night instead of two."
            />
          </View>
        ) : (
          <>
            <Text step="caption" tone="muted" style={styles.count}>
              {free} room{free === 1 ? "" : "s"} free across {rows.length} resort
              {rows.length === 1 ? "" : "s"}
            </Text>
            {rows.map((offer) => (
              <Card
                key={offer.resort.id}
                // Card takes a title and no subtitle; where the resort is
                // goes beside its name rather than inventing a prop
                title={
                  offer.resort.location
                    ? `${offer.resort.name} · ${offer.resort.location}`
                    : offer.resort.name
                }
              >
                {offer.rooms.map((room, i) => (
                  <Row
                    key={room.roomId}
                    title={room.roomName}
                    subtitle={
                      // the guest's price, always sent
                      `Guest pays ${whole(room.baseRate)} a night`
                    }
                    last={i === offer.rooms.length - 1}
                    accessibilityLabel={`${room.roomName} at ${offer.resort.name}, guest pays ${whole(
                      room.baseRate,
                    )} a night, ${
                      room.agentRate === undefined
                        ? "your rate is not shown"
                        : `you pay ${whole(room.agentRate)}`
                    }`}
                    onPress={() =>
                      router.push(
                        `/new-booking?resortId=${offer.resort.id}&roomId=${room.roomId}&checkIn=${asked.from}&checkOut=${asked.to}` as never,
                      )
                    }
                    right={
                      room.agentRate === undefined ? (
                        // absent is not zero: this resort does not show
                        // agencies its rates, and printing the guest's
                        // price here would be quoting at no margin
                        <Text step="small" tone="muted">
                          rate not shown
                        </Text>
                      ) : (
                        <View style={styles.rate}>
                          <Text step="caption" tone="muted">
                            you pay
                          </Text>
                          <Text step="body" weight="medium" tone="title" tabular>
                            {whole(room.agentRate)}
                          </Text>
                        </View>
                      )
                    }
                  />
                ))}
              </Card>
            ))}
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  fields: { gap: space.md },
  rate: { alignItems: "flex-end" },
  count: { paddingHorizontal: space.xs },
  middle: { paddingVertical: space.xl },
});
