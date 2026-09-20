/**
 * Changing a booking after it was made.
 *
 * A guest staying one night longer used to mean cancelling and booking
 * again, which loses the payment ledger along with the booking. This
 * moves the dates, the head count, the discount and the note, and leaves
 * everything else — the rooms, the guest, the money already taken — where
 * it is.
 *
 * Two rules come from `@rh/shared` because the API enforces them and only
 * the API knew them: `canEditStay` decides whether this person may change
 * this booking at all, and `bookingChanges` works out what actually
 * moved. Both matter here for the same reason: a form offered and then
 * refused has wasted a clerk's time with a guest watching.
 */
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import {
  DISCOUNT_KINDS,
  DISCOUNT_KIND_LABELS,
  bookingChanges,
  canEditStay,
  nightsBetweenIso,
  type BookingDetail,
  type DiscountKind,
} from "@rh/shared";
import { Stay, type StayTools } from "../../../../../src/booking/stay";
import { client, useAuth } from "../../../../../src/api/session";
import { Button } from "../../../../../src/design/button";
import { Chip } from "../../../../../src/design/chip";
import { Counter } from "../../../../../src/design/counter";
import { DateNav } from "../../../../../src/design/date-nav";
import { Field, Input } from "../../../../../src/design/input";
import { Empty } from "../../../../../src/design/states";
import { Card } from "../../../../../src/design/surface";
import { Text } from "../../../../../src/design/text";
import { useAction } from "../../../../../src/design/use-action";
import { color, radius, space } from "../../../../../src/design/tokens";

export default function EditScreen() {
  return (
    <Stay title="Change %s">{(booking, tools) => <Form booking={booking} tools={tools} />}</Stay>
  );
}

const civil = (value: string | null) => (value ? value.slice(0, 10) : "");

function Form({ booking, tools }: { booking: BookingDetail; tools: StayTools }) {
  const { role, activeResort } = useAuth();
  const verdict = canEditStay({ role: role ?? "", state: booking.state });

  const [checkIn, setCheckIn] = useState(civil(booking.checkIn));
  const [checkOut, setCheckOut] = useState(civil(booking.checkOut));
  const [adults, setAdults] = useState(booking.adults);
  const [children, setChildren] = useState(booking.children);
  const [discount, setDiscount] = useState(booking.discountValue ?? booking.discount);
  const [discountKind, setDiscountKind] = useState<DiscountKind>(
    (booking.discountKind ?? "FLAT") as DiscountKind,
  );
  const [remarks, setRemarks] = useState(booking.remarks ?? "");
  const [refused, setRefused] = useState<string | null>(null);

  const save = useAction(async () => {
    const patch = bookingChanges(
      booking,
      { checkIn, checkOut, adults, children, discount, discountKind, remarks },
      { mayChangeDiscount: verdict.mayChangeDiscount },
    );
    // nothing moved: leaving quietly is the honest answer, not a request
    // that re-prices the stay to arrive at the same figures
    if (Object.keys(patch).length === 0) {
      router.back();
      return;
    }
    setRefused(null);
    try {
      await client.bookings.update(booking.id, patch);
      await tools.reload();
      router.back();
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That did not go through.");
    }
  });

  /**
   * Refused before the form, not after it.
   *
   * The console offers Edit on a checked-in booking to anybody with the
   * permission, and the API turns a front desk away — with the dates
   * changed, the note rewritten, and nothing said about which part was
   * the problem.
   */
  if (!verdict.allowed) {
    return (
      <View style={styles.middle}>
        <Empty message="This booking cannot be changed" hint={verdict.why ?? undefined} />
        <Button label="Back to the booking" kind="ghost" onPress={() => router.back()} />
      </View>
    );
  }

  const nights = nightsBetweenIso(checkIn, checkOut);

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Card title="When">
        <View style={styles.fields}>
          <DateNav
            what="Check-in"
            home={false}
            value={checkIn}
            timezone={activeResort?.timezone}
            onChange={(day) => {
              setCheckIn(day);
              // a departure that is no longer after the arrival is not a
              // choice anybody made; it is the old answer to a changed
              // question, and the API refuses it as an invalid range
              if (day >= checkOut) setCheckOut(day);
            }}
          />
          <DateNav
            what="Check-out"
            home={false}
            value={checkOut}
            timezone={activeResort?.timezone}
            onChange={(day) => (day > checkIn ? setCheckOut(day) : undefined)}
          />
          <Text step="caption" tone="muted">
            {nights} night{nights === 1 ? "" : "s"}
            {nights !== booking.nights ? ` · was ${booking.nights}` : ""}
          </Text>
          {nights !== booking.nights ? (
            <Text step="caption" tone="warn">
              Moving the dates re-prices every night, and the rooms have to be free.
            </Text>
          ) : null}
        </View>
      </Card>

      <Card title="How many">
        <View style={styles.fields}>
          <Field label="Adults">
            <Counter label="adult" min={1} value={adults} onChange={setAdults} />
          </Field>
          <Field label="Children">
            <Counter label="child" value={children} onChange={setChildren} />
          </Field>
        </View>
      </Card>

      {/* an agent is quoted the resort's terms; they do not set them, and
          the API refuses a patch that carries one from them */}
      {verdict.mayChangeDiscount ? (
        <Card title="Discount">
          <View style={styles.fields}>
            <View style={styles.kinds}>
              {DISCOUNT_KINDS.map((k) => (
                <Chip
                  key={k}
                  label={DISCOUNT_KIND_LABELS[k]}
                  on={discountKind === k}
                  onPress={() => setDiscountKind(k)}
                />
              ))}
            </View>
            <Input
              accessibilityLabel="Discount"
              value={discount ? String(discount) : ""}
              onChangeText={(text) => setDiscount(Number(text.replace(/[^0-9.]/g, "")) || 0)}
              placeholder="0"
              keyboardType="numeric"
            />
            {discountKind === "PERCENT" ? (
              <Text step="caption" tone="muted">
                A percentage of the rooms and extra persons, worked out again if the dates change.
              </Text>
            ) : null}
          </View>
        </Card>
      ) : null}

      <Card title="Note">
        <Field label="Remarks" hint="Anything the desk should know">
          <Input
            value={remarks}
            onChangeText={setRemarks}
            placeholder="Late arrival, sea-facing requested…"
          />
        </Field>
      </Card>

      {refused ? (
        <View style={styles.refused}>
          <Text step="small" tone="danger" weight="medium">
            {refused}
          </Text>
        </View>
      ) : null}

      <Button label="Save changes" loading={save.busy} onPress={save.go} />
      <Button label="Leave it" kind="ghost" onPress={() => router.back()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  middle: { flex: 1, justifyContent: "center", alignItems: "center", gap: space.md, padding: space.lg },
  fields: { gap: space.md },
  kinds: { flexDirection: "row", gap: space.sm },
  refused: {
    backgroundColor: color.danger.bg,
    borderWidth: 1,
    borderColor: color.danger.line,
    borderRadius: radius.md,
    padding: space.md,
  },
});
