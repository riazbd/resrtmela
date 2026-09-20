/**
 * What the guest owes before they leave.
 *
 * Water from the minibar, a broken lamp, a smoking fine. The desk had
 * nowhere to put any of it, so it went on paper that never reached the
 * invoice. They are added here, the figures underneath move as they are,
 * and **Check out is the last button** — because checking out issues the
 * invoice, and an issued invoice does not take another line.
 *
 * Which of a booking's items are removable charges is `chargeLines` in
 * `@rh/shared`: the rooms are the stay, and food and activities have
 * their own bills.
 */
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import {
  STAY_CHARGE_KINDS,
  STAY_CHARGE_LABELS,
  chargeLines,
  formatMoney,
  isStayChargeKind,
  type BookingDetail,
  type StayChargeKind,
} from "@rh/shared";
import { Stay, type StayTools } from "../../../../../src/booking/stay";
import { client } from "../../../../../src/api/session";
import { useStayDesk } from "../../../../../src/api/desk";
import { Button } from "../../../../../src/design/button";
import { Chip } from "../../../../../src/design/chip";
import { Counter } from "../../../../../src/design/counter";
import { Field, Input } from "../../../../../src/design/input";
import { useMoneyFormat } from "../../../../../src/design/money";
import { Card, Row, Stat } from "../../../../../src/design/surface";
import { Text } from "../../../../../src/design/text";
import { useAction } from "../../../../../src/design/use-action";
import { color, radius, space } from "../../../../../src/design/tokens";

export default function DepartScreen() {
  return (
    <Stay title="Check out %s">
      {(booking, tools) => <Departure booking={booking} tools={tools} />}
    </Stay>
  );
}

const PLACEHOLDER: Record<StayChargeKind, string> = {
  SERVICE: "Mineral water",
  DAMAGE: "Broken lamp",
  FINE: "Smoking in the room",
};

function Departure({ booking, tools }: { booking: BookingDetail; tools: StayTools }) {
  const desk = useStayDesk();
  const money = useMoneyFormat();
  const whole = (amount: number) => formatMoney(amount, { ...money, decimals: 0 });

  const [kind, setKind] = useState<StayChargeKind>(STAY_CHARGE_KINDS[0]);
  const [label, setLabel] = useState("");
  const [qty, setQty] = useState(1);
  const [amount, setAmount] = useState(0);
  const [tried, setTried] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const lines = chargeLines(booking);
  const incomplete = !label.trim() || !(amount > 0);

  const add = useAction(async () => {
    /**
     * Refused rather than greyed out, for the reason the booking form
     * learned: a disabled button with an empty box scrolled out of sight
     * says nothing at all about why nothing happened.
     */
    if (incomplete) {
      setTried(true);
      return;
    }
    setRefused(null);
    try {
      await client.bookings.addCharge(booking.id, { kind, label: label.trim(), qty, amount });
      setLabel("");
      setQty(1);
      setAmount(0);
      setTried(false);
      await tools.reload();
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That did not go through.");
    }
  });

  const leave = useAction(async () => {
    setRefused(null);
    try {
      await desk.transition(booking, "CHECKED_OUT");
      await tools.reload();
      router.back();
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That did not go through.");
    }
  });

  async function remove(itemId: number) {
    setRefused(null);
    try {
      await client.bookings.removeCharge(booking.id, itemId);
      await tools.reload();
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That did not go through.");
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Card title="Services, damage & fines">
        {lines.length === 0 ? (
          <Text step="small" tone="muted">
            Nothing charged beyond the stay.
          </Text>
        ) : (
          lines.map((line, i) => {
            const what = isStayChargeKind(line.chargeKind)
              ? STAY_CHARGE_LABELS[line.chargeKind]
              : "Charge";
            const total = (line.unitPrice ?? 0) * line.qty;
            return (
              <Row
                key={line.id}
                title={`${what} — ${line.label ?? ""}`.replace(/ — $/, "")}
                subtitle={line.qty > 1 ? `× ${line.qty}` : undefined}
                last={i === lines.length - 1}
                accessibilityLabel={`${what} — ${line.label ?? ""}, ${whole(total)}`}
                right={
                  <View style={styles.lineEnd}>
                    <Text step="body" tone="body" tabular>
                      {whole(total)}
                    </Text>
                    <Button
                      label="×"
                      kind="ghost"
                      block={false}
                      accessibilityLabel={`Remove ${line.label ?? what}`}
                      onPress={() => void remove(line.id)}
                    />
                  </View>
                }
              />
            );
          })
        )}
      </Card>

      <Card title="Add a charge">
        <View style={styles.fields}>
          <View style={styles.kinds}>
            {STAY_CHARGE_KINDS.map((k) => (
              <Chip
                key={k}
                label={STAY_CHARGE_LABELS[k]}
                on={kind === k}
                onPress={() => setKind(k)}
              />
            ))}
          </View>
          <Field label="What for">
            <Input
              value={label}
              maxLength={160}
              onChangeText={(text) => {
                setLabel(text);
                if (text.trim()) setTried(false);
              }}
              placeholder={PLACEHOLDER[kind]}
            />
          </Field>
          <Field label="Amount each">
            <Input
              value={amount ? String(amount) : ""}
              onChangeText={(text) => setAmount(Number(text.replace(/[^0-9.]/g, "")) || 0)}
              placeholder="0"
              keyboardType="numeric"
            />
          </Field>
          <Field label="How many">
            <Counter label="of these" min={1} value={qty} onChange={setQty} />
          </Field>
          {tried && incomplete ? (
            <Text step="small" tone="danger" weight="medium">
              Say what it was for, and what it cost.
            </Text>
          ) : null}
          <Button label="Add charge" kind="ghost" loading={add.busy} onPress={add.go} />
        </View>
      </Card>

      <View style={styles.figures}>
        <Stat label="Total" value={whole(booking.total)} />
        <Stat label="Paid" value={whole(booking.paid - (booking.refunded ?? 0))} tone="ok" />
        <Stat label="Due" value={whole(booking.due)} tone={booking.due > 0 ? "danger" : "title"} />
      </View>

      {booking.due > 0 ? (
        <Button
          label="Take payment first"
          kind="ghost"
          onPress={() => router.push(`/bookings/${booking.id}/pay` as never)}
        />
      ) : null}

      {refused ? (
        <View style={styles.refused}>
          <Text step="small" tone="danger" weight="medium">
            {refused}
          </Text>
        </View>
      ) : null}

      {/* last, and deliberately: this issues the invoice, and an issued
          invoice does not take another line */}
      <Button label="Check out" loading={leave.busy} onPress={leave.go} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  fields: { gap: space.md },
  kinds: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  lineEnd: { flexDirection: "row", alignItems: "center", gap: space.xs },
  figures: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  refused: {
    backgroundColor: color.danger.bg,
    borderWidth: 1,
    borderColor: color.danger.line,
    borderRadius: radius.md,
    padding: space.md,
  },
});
