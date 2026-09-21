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
 * What a clerk can do from here is `nextStates` in `@rh/shared` — the same
 * six answers the console runs on, so the two cannot come to offer
 * different buttons on the same booking. Arriving and leaving each open a
 * screen rather than firing straight away, because each asks the one
 * question that moment is the only moment able to answer: who actually
 * came, and what else is owed.
 */
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { keys, useApi } from "@rh/app-core";
import {
  billLines,
  bookingStateLabel,
  nextStates,
  dayLabel,
  formatMoney,
  methodLabel,
  canEditStay,
  roomNames,
  type BookingDetail,
  type NextState,
} from "@rh/shared";
import { client, useAuth } from "../../../../../src/api/session";
import { useStayDesk } from "../../../../../src/api/desk";
import { Button } from "../../../../../src/design/button";
import { Money, useMoneyFormat } from "../../../../../src/design/money";
import { Empty, Loading, Problem, Stale } from "../../../../../src/design/states";
import { Card, Row, Stat } from "../../../../../src/design/surface";
import { Text } from "../../../../../src/design/text";
import { useAction } from "../../../../../src/design/use-action";
import { color, radius, space } from "../../../../../src/design/tokens";

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

        <Desk booking={b} onDone={() => void booking.refetch()} />

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

        {/*
          The invoice number was a footnote and nothing else: the app knew
          the bill existed and could not show it. A guest at the counter
          asking for their bill is the case this screen exists for.
        */}
        {activeResort ? (
          <TheInvoice booking={b} onIssued={() => void booking.refetch()} />
        ) : null}
      </ScrollView>
    </>
  );
}

/**
 * The bill — and issuing one, when the stay does not have one yet.
 *
 * The button used to appear only where `invoiceNo` was already set, and
 * checking out is the only thing that sets it. So a guest asking for
 * their bill at any point before they leave — which is when guests ask —
 * could not be given one from the phone, though the API has issued them
 * on demand all along and the console's own button does exactly this.
 *
 * It issues on one press, with no question first, because that is what
 * the console's button does and the two clients answer to one design.
 * The consequence is real — an issued invoice freezes the charge, and
 * `addCharge` then refuses the stay in its own words — but the console
 * carries that without asking, and a confirmation on one client only
 * would make the same act feel like two different acts.
 */
function TheInvoice({ booking, onIssued }: { booking: BookingDetail; onIssued: () => void }) {
  const { can } = useAuth();
  const [refused, setRefused] = useState<string | null>(null);

  const issue = useAction(async () => {
    setRefused(null);
    try {
      await client.bookings.generateInvoice(booking.id);
      onIssued();
      router.push(`/bookings/${booking.id}/invoice` as never);
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That did not go through.");
    }
  });

  if (booking.invoiceNo) {
    return (
      <Button
        label={`Invoice ${booking.invoiceNo}`}
        kind="ghost"
        onPress={() => router.push(`/bookings/${booking.id}/invoice` as never)}
      />
    );
  }

  /**
   * The API refuses to invoice a stay that was cancelled or never
   * arrived, and asks for `payments.create` to issue one. Offering a
   * button that answers 400 or 403 is worse than offering none.
   */
  if (booking.state === "CANCELLED" || booking.state === "NO_SHOW") return null;
  if (!can("payments.create")) return null;

  return (
    <View style={styles.desk}>
      <Button
        label="Issue the invoice"
        kind="ghost"
        loading={issue.busy}
        onPress={issue.go}
      />
      {refused ? (
        <Text step="small" tone="danger" weight="medium">
          {refused}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * What can be done to this booking, and nothing that cannot.
 *
 * The list is `nextStates`, so a cancelled booking is offered nothing and
 * a checked-out one is offered nothing — the two states where a button
 * would be a lie. Taking money is separate from all of them: it is owed or
 * it is not, whatever state the stay is in.
 *
 * Arriving and leaving push a screen instead of writing, because each has
 * a question to ask first. A no-show has none, so it goes straight
 * through — after a confirmation, because it says a guest did not come and
 * is not walked back with one tap.
 */
function Desk({ booking, onDone }: { booking: BookingDetail; onDone: () => void }) {
  const desk = useStayDesk();
  const { role } = useAuth();
  const [refused, setRefused] = useState<string | null>(null);
  const [asking, setAsking] = useState<NextState | null>(null);

  const move = useAction(async () => {
    const action = asking;
    if (!action) return;
    setAsking(null);
    setRefused(null);
    try {
      await desk.transition(booking, action.to);
      onDone();
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That did not go through.");
    }
  });

  const ahead = nextStates(booking.state);
  /**
   * `canEditStay`, not a list of states. The API refuses a front desk
   * once the guest is in the room, and the console offers the form
   * anyway — so a clerk changes the dates, presses Save, and is told
   * "Front desk can edit only Pending/Confirmed" with the form still up.
   */
  const mayChange = canEditStay({ role: role ?? "", state: booking.state }).allowed;
  if (ahead.length === 0 && booking.due <= 0 && !mayChange) return null;

  return (
    <View style={styles.desk}>
      {asking ? (
        <View style={styles.asking}>
          <Text step="body" tone="title" weight="medium">
            {asking.label}?
          </Text>
          <Text step="small" tone="muted">
            {asking.to === "NO_SHOW"
              ? "This says the guest never came. The nights stay held and the booking is closed."
              : "This cannot be undone from here."}
          </Text>
          <View style={styles.askRow}>
            <Button label="Yes" kind="danger" loading={move.busy} onPress={move.go} block={false} />
            <Button label="Not now" kind="ghost" onPress={() => setAsking(null)} block={false} />
          </View>
        </View>
      ) : (
        <View style={styles.actions}>
          {ahead.map((action) => (
            <Button
              key={action.to}
              label={action.label}
              kind={action.grave ? "ghost" : "primary"}
              block={false}
              onPress={() => {
                if (action.to === "CHECKED_IN") {
                  router.push(`/bookings/${booking.id}/arrive` as never);
                } else if (action.to === "CHECKED_OUT") {
                  router.push(`/bookings/${booking.id}/depart` as never);
                } else if (action.grave) {
                  setAsking(action);
                } else {
                  setAsking(action);
                }
              }}
            />
          ))}
          {booking.due > 0 ? (
            <Button
              label="Take payment"
              kind={ahead.length > 0 ? "ghost" : "primary"}
              block={false}
              onPress={() => router.push(`/bookings/${booking.id}/pay` as never)}
            />
          ) : null}
          {mayChange ? (
            <Button
              label="Change"
              kind="ghost"
              block={false}
              onPress={() => router.push(`/bookings/${booking.id}/edit` as never)}
            />
          ) : null}
        </View>
      )}

      {refused ? (
        <Text step="small" tone="danger" weight="medium">
          {refused}
        </Text>
      ) : null}
    </View>
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
  desk: { gap: space.sm },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  asking: {
    gap: space.sm,
    backgroundColor: color.warn.bg,
    borderWidth: 1,
    borderColor: color.warn.line,
    borderRadius: radius.md,
    padding: space.md,
  },
  askRow: { flexDirection: "row", gap: space.sm },
  emptyBox: { paddingVertical: space.lg },
  footnote: { textAlign: "center" },
});
