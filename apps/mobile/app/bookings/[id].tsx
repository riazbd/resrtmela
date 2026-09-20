/**
 * One booking, everything about it.
 *
 * The screen a clerk opens with a guest standing in front of them, so the
 * order is the order the questions come in: who and which room, what is
 * still owed, then the bill line by line, then what has already been paid.
 *
 * The bill's lines are `billLines` from `@rh/shared` — the same function the
 * console's detail panel draws from. A guest shown one total at the desk and
 * another on a phone has been overcharged by one of them.
 *
 * Nothing here writes yet. Check-in, check-out, taking money and adding a
 * charge arrive with the rest of the write screens; until then this is the
 * page a clerk reads from.
 */
import { useCallback } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { keys, useApi } from "@rh/app-core";
import {
  billLines,
  bookingStateLabel,
  dayLabel,
  formatMoney,
  methodLabel,
  roomNames,
  type BookingDetail,
} from "@rh/shared";
import { client, useAuth } from "../../src/api/session";
import { Button } from "../../src/design/button";
import { Money, useMoneyFormat } from "../../src/design/money";
import { Empty, Loading, Problem, Stale } from "../../src/design/states";
import { Card, Row, Stat } from "../../src/design/surface";
import { Text } from "../../src/design/text";
import { color, radius, space } from "../../src/design/tokens";

/** "2 adults, 1 child" — and the ones who turned up unannounced, separately. */
function whoIsStaying(b: BookingDetail): string {
  const parts = [`${b.adults} adult${b.adults === 1 ? "" : "s"}`];
  if (b.children > 0) parts.push(`${b.children} ${b.children === 1 ? "child" : "children"}`);
  if (b.extraPersons > 0) {
    parts.push(`${b.extraPersons} extra person${b.extraPersons === 1 ? "" : "s"}`);
  }
  return parts.join(", ");
}

export default function BookingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const bookingId = Number(id);
  const { activeResort } = useAuth();
  const money = useMoneyFormat();
  const whole = useCallback(
    (amount: number) => formatMoney(amount, { ...money, decimals: 0 }),
    [money],
  );

  const booking = useApi(keys.booking(bookingId), () => client.bookings.get(bookingId), {
    enabled: Number.isFinite(bookingId),
  });

  const header = <Stack.Screen options={{ title: booking.data?.code ?? "Booking" }} />;

  if (booking.error && !booking.data) {
    return (
      <>
        {header}
        <View style={styles.middle}>
          <Problem error={booking.error} onRetry={() => void booking.refetch()} />
          {/* a booking that will not open is a dead end without this: the
              header's back arrow is missing whenever this screen was opened
              from a notification rather than pushed from a list */}
          <Button label="Back to bookings" kind="ghost" block={false} onPress={() => router.back()} />
        </View>
      </>
    );
  }
  if (!booking.data) {
    return (
      <>
        {header}
        <Loading what="the booking" />
      </>
    );
  }

  const b = booking.data;
  const lines = billLines(b, money);
  // not `b.rooms`: the detail route does not send one, whatever the type
  // used to claim. The rooms are on the items.
  const rooms = roomNames(b).join(", ") || "—";

  return (
    <>
      {header}
      <Stale age={booking.stale} />
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={
          <RefreshControl refreshing={booking.isRefetching} onRefresh={() => void booking.refetch()} />
        }
      >
        <Card>
          <View style={styles.who}>
            <View style={styles.whoText}>
              <Text step="title" weight="bold" tone="title">
                {b.guest?.fullName ?? "—"}
              </Text>
              {b.guest?.phone ? (
                <Text step="body" tone="muted">
                  {b.guest.phone}
                </Text>
              ) : null}
            </View>
            <View style={styles.badge}>
              <Text step="caption" weight="medium" tone="body">
                {bookingStateLabel(b.state)}
              </Text>
            </View>
          </View>

          <View style={styles.facts}>
            <Fact label="Rooms" value={rooms} />
            <Fact
              label="Stay"
              value={`${dayLabel(b.checkIn)} → ${dayLabel(b.checkOut)} · ${b.nights} night${b.nights === 1 ? "" : "s"}`}
            />
            <Fact label="Guests" value={whoIsStaying(b)} />
            {b.agent ? <Fact label="Sold by" value={b.agent} /> : null}
            {b.source ? <Fact label="Source" value={b.source} /> : null}
          </View>
        </Card>

        <View style={styles.figures}>
          <Stat label="Total" value={whole(b.total)} />
          <Stat label="Paid" value={whole(b.paid)} tone="ok" />
          <Stat label="Due" value={whole(b.due)} tone={b.due > 0 ? "danger" : "title"} />
        </View>

        <Card title="Bill">
          {lines.length === 0 ? (
            <View style={styles.emptyBox}>
              <Empty message="Nothing on the bill yet" />
            </View>
          ) : (
            lines.map((line, i) => (
              <Row
                key={line.id}
                title={line.label}
                subtitle={line.detail ?? undefined}
                last={i === lines.length - 1 && b.discount <= 0}
                // a resort can hide its rates from the agent selling it, and
                // `null` is that — an em dash, not a quiet zero
                accessibilityLabel={`${line.label}, ${line.amount === null ? "price hidden" : whole(line.amount)}`}
                right={
                  line.amount === null ? (
                    <Text step="body" tone="muted">
                      —
                    </Text>
                  ) : (
                    <Money amount={line.amount} decimals={0} step="body" tone="body" />
                  )
                }
              />
            ))
          )}
          {b.discount > 0 ? (
            <Row
              title={
                // the percentage is what was typed; `discount` is what it came
                // to, and showing only the second leaves nobody able to check it
                b.discountKind === "PERCENT" ? `Discount (${b.discountValue}%)` : "Discount"
              }
              last
              accessibilityLabel={`Discount: ${whole(b.discount)}`}
              right={
                <Text step="body" weight="medium" tone="ok" tabular>
                  −{whole(b.discount)}
                </Text>
              }
            />
          ) : null}
        </Card>

        <Card title="Payments">
          {b.payments.length === 0 ? (
            <View style={styles.emptyBox}>
              <Empty message="No payments yet" />
            </View>
          ) : (
            b.payments.map((p, i) => (
              <Row
                key={p.id}
                title={methodLabel(p.method)}
                subtitle={`${dayLabel(p.receivedAt, { style: "full" })} · ${p.type.toLowerCase()}`}
                meta={p.receivedBy ? `Taken by ${p.receivedBy}` : undefined}
                last={i === b.payments.length - 1}
                accessibilityLabel={`${methodLabel(p.method)}, ${whole(p.amount)}, ${dayLabel(p.receivedAt, { style: "full" })}${p.receivedBy ? `, taken by ${p.receivedBy}` : ""}`}
                right={<Money amount={p.amount} decimals={0} step="body" weight="medium" tone="ok" />}
              />
            ))
          )}
        </Card>

        {b.remarks ? (
          <Card title="Note">
            <Text step="body" tone="body">
              {b.remarks}
            </Text>
          </Card>
        ) : null}

        {activeResort && b.invoiceNo ? (
          <Text step="caption" tone="muted" style={styles.footnote}>
            Invoice {b.invoiceNo}
          </Text>
        ) : null}
      </ScrollView>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text step="caption" tone="muted" style={styles.factLabel}>
        {label}
      </Text>
      <Text step="body" tone="title" style={styles.factValue}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  middle: { flex: 1, justifyContent: "center", alignItems: "center", gap: space.md, padding: space.lg },
  who: { flexDirection: "row", alignItems: "flex-start", gap: space.md, paddingBottom: space.md },
  whoText: { flex: 1, gap: 2 },
  badge: {
    backgroundColor: color.ink[100],
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  facts: { gap: space.sm, borderTopWidth: 1, borderTopColor: color.line, paddingTop: space.md },
  fact: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  factLabel: { width: 72 },
  factValue: { flex: 1 },
  figures: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  emptyBox: { paddingVertical: space.lg },
  footnote: { textAlign: "center" },
});
