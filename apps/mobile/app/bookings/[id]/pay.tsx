/**
 * Money into the drawer.
 *
 * The box opens on what is still due, because that is what is usually
 * handed over — and a clerk who has to type ৳8,000 from memory while
 * counting notes is a clerk who types ৳800.
 *
 * It goes through the outbox. A payment carries its own reference, so the
 * server recognises a replay and one queued write makes one payment
 * however many times it is sent — which is the only way a desk can take
 * money with no network and still be right afterwards.
 */
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { keys, useApi } from "@rh/app-core";
import { formatMoney, type BookingDetail, type ResortOption } from "@rh/shared";
import { Stay, type StayTools } from "../../../src/booking/stay";
import { client, useAuth } from "../../../src/api/session";
import { useStayDesk } from "../../../src/api/desk";
import { Button } from "../../../src/design/button";
import { Chip } from "../../../src/design/chip";
import { Field, Input } from "../../../src/design/input";
import { useMoneyFormat } from "../../../src/design/money";
import { Card, Stat } from "../../../src/design/surface";
import { Text } from "../../../src/design/text";
import { useAction } from "../../../src/design/use-action";
import { color, radius, space } from "../../../src/design/tokens";

export default function PayScreen() {
  return (
    <Stay title="Payment — %s">
      {(booking, tools) => <TakeMoney booking={booking} tools={tools} />}
    </Stay>
  );
}

function TakeMoney({ booking, tools }: { booking: BookingDetail; tools: StayTools }) {
  const { activeResort } = useAuth();
  const desk = useStayDesk();
  const money = useMoneyFormat();
  const whole = (n: number) => formatMoney(n, { ...money, decimals: 0 });

  /**
   * What is owed, as the opening figure. Not a lock — a guest paying half
   * is the ordinary case — but the number that is right most often is the
   * one that should already be there.
   */
  const [amount, setAmount] = useState(Math.max(0, booking.due));
  const [method, setMethod] = useState("CASH");
  const [tried, setTried] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const methods = useApi<ResortOption[]>(
    keys.options(activeResort?.id, "PAYMENT_METHOD"),
    () => client.options.list(activeResort!.id, "PAYMENT_METHOD"),
    { enabled: activeResort?.id !== undefined, staleTime: 3_600_000 },
  );
  const choices = (methods.data ?? []).filter((m) => m.active);

  const take = useAction(async () => {
    if (!(amount > 0)) {
      setTried(true);
      return;
    }
    setRefused(null);
    try {
      const { queued } = await desk.pay(booking, { amount, method });
      await tools.reload();
      // queued or sent, the desk is done with this guest either way; the
      // outbox tells them separately if the server later refuses it
      void queued;
      router.back();
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That did not go through.");
    }
  });

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.figures}>
        <Stat label="Total" value={whole(booking.total)} />
        <Stat label="Paid" value={whole(booking.paid - (booking.refunded ?? 0))} tone="ok" />
        <Stat label="Due" value={whole(booking.due)} tone={booking.due > 0 ? "danger" : "title"} />
      </View>

      <Card title="Taking now">
        <View style={styles.fields}>
          <Field
            label="Amount"
            error={tried && !(amount > 0) ? "Type how much is being paid." : null}
          >
            <Input
              value={amount ? String(amount) : ""}
              onChangeText={(text) => {
                const next = Number(text.replace(/[^0-9.]/g, "")) || 0;
                setAmount(next);
                if (next > 0) setTried(false);
              }}
              placeholder="0"
              keyboardType="numeric"
              invalid={tried && !(amount > 0)}
            />
          </Field>
          <View style={styles.methods}>
            {choices.map((option) => (
              <Chip
                key={option.code}
                label={option.label}
                on={method === option.code}
                onPress={() => setMethod(option.code)}
              />
            ))}
          </View>
        </View>
      </Card>

      {refused ? (
        <View style={styles.refused}>
          <Text step="small" tone="danger" weight="medium">
            {refused}
          </Text>
        </View>
      ) : null}

      <Button label={`Take ${whole(amount)}`} loading={take.busy} onPress={take.go} />
      <Button label="Cancel" kind="ghost" onPress={() => router.back()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  figures: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  fields: { gap: space.md },
  methods: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  refused: {
    backgroundColor: color.danger.bg,
    borderWidth: 1,
    borderColor: color.danger.line,
    borderRadius: radius.md,
    padding: space.md,
  },
});
