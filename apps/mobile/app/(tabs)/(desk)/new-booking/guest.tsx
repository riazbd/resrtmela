/**
 * Step 2 — who is staying.
 *
 * Everything the room does not decide. The three switches at the top come
 * first because each of them changes what is asked below: a walk-in is not
 * asked for papers, a group is one booking per room rather than one
 * booking, and extra persons only exist if the picked rooms have a bed
 * spare.
 *
 * The extra-person figure is `extraPersonRoom` in `@rh/shared`, and it is
 * not a rate times a count: the API fills the picked rooms one at a time
 * and charges each person at the rate of the room they end up in. A form
 * that multiplies shows a figure the invoice then contradicts — after the
 * clerk has read it out.
 */
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import {
  BOOKING_GAP_MESSAGES,
  DISCOUNT_KINDS,
  DISCOUNT_KIND_LABELS,
  extraPersonRoom,
  formatMoney,
  whatTheBookingNeeds,
} from "@rh/shared";
import { useDraft } from "../../../../src/booking/draft";
import { useAuth } from "../../../../src/api/session";
import { Button } from "../../../../src/design/button";
import { Chip } from "../../../../src/design/chip";
import { Counter } from "../../../../src/design/counter";
import { Field, Input } from "../../../../src/design/input";
import { useMoneyFormat } from "../../../../src/design/money";
import { Card } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { Toggle } from "../../../../src/design/toggle";
import { space } from "../../../../src/design/tokens";

export default function WhoScreen() {
  const { isStaff, isAgent } = useAuth();
  const money = useMoneyFormat();
  const draft = useDraft();
  const { rooms, set } = draft;
  const [tried, setTried] = useState(false);

  const extra = extraPersonRoom(rooms);
  const extraCost = extra.costPerNight(draft.extraPersons);
  const gaps = whatTheBookingNeeds({ rooms: rooms.length, guestName: draft.guestName });

  /**
   * A walk-in has no name to give and no papers to copy — the guest is
   * standing at the counter. "local" is the console's word for it, and the
   * two clients have to agree because the same row is read back on both.
   */
  function walkIn(on: boolean) {
    const name = on
      ? draft.guestName || "local"
      : draft.guestName === "local"
        ? ""
        : draft.guestName;
    set({ walkIn: on, guestName: name, nid: on ? "" : draft.nid });
  }

  function next() {
    if (gaps.length > 0) {
      setTried(true);
      return;
    }
    router.push("/new-booking/money");
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.switches}>
        {isAgent ? null : (
          <Toggle
            label="Walk-in (local)"
            hint="No name or papers — the guest is at the counter"
            value={draft.walkIn}
            onChange={walkIn}
          />
        )}
        {/* one room cannot be split into a booking each */}
        {rooms.length > 1 ? (
          <Toggle
            label="Group: separate booking per room"
            hint="One guest, one set of terms, a booking and an invoice per room"
            value={draft.group}
            onChange={(on) => set({ group: on })}
          />
        ) : null}
      </View>

      <Card title="Guest">
        <View style={styles.fields}>
          <Field
            label="Guest name"
            error={tried && gaps.includes("guestName") ? BOOKING_GAP_MESSAGES.guestName : null}
          >
            <Input
              value={draft.guestName}
              onChangeText={(text) => {
                set({ guestName: text });
                if (text.trim()) setTried(false);
              }}
              placeholder={draft.walkIn ? "local" : "Full name"}
              autoCapitalize="words"
              invalid={tried && gaps.includes("guestName")}
            />
          </Field>

          <Field label="Mobile" hint={draft.walkIn ? "Optional" : "For the booking confirmation"}>
            <Input
              value={draft.phone}
              onChangeText={(phone) => set({ phone })}
              placeholder="01XXX-XXXXXX"
              keyboardType="phone-pad"
              autoComplete="tel"
            />
          </Field>

          <Field label="Email" hint="Optional — invoices and one-time codes">
            <Input
              value={draft.email}
              onChangeText={(email) => set({ email })}
              placeholder="name@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          </Field>

          {draft.walkIn ? null : (
            <Field label="NID / Passport" hint="Optional">
              <Input value={draft.nid} onChangeText={(nid) => set({ nid })} autoCapitalize="characters" />
            </Field>
          )}
        </View>
      </Card>

      <Card title="How many">
        <View style={styles.fields}>
          <Field label="Adults">
            <Counter
              label="adult"
              min={1}
              value={draft.adults}
              onChange={(adults) => set({ adults })}
            />
          </Field>
          <Field label="Children">
            <Counter label="child" value={draft.children} onChange={(children) => set({ children })} />
          </Field>
          {extra.allowed ? (
            <Field
              label="Extra persons"
              hint={
                draft.extraPersons > 0
                  ? `+${formatMoney(extraCost, { ...money, decimals: 0 })} / night`
                  : `These rooms take ${extra.max} extra person${extra.max === 1 ? "" : "s"}`
              }
            >
              <Counter
                label="extra person"
                max={extra.max}
                value={draft.extraPersons}
                onChange={(extraPersons) => set({ extraPersons })}
              />
            </Field>
          ) : null}
        </View>
      </Card>

      {/* an agent is quoted the resort's terms; they do not set them */}
      {isStaff ? (
        <Card title={draft.group ? "Discount per room" : "Discount"}>
          <View style={styles.fields}>
            <View style={styles.kinds}>
              {DISCOUNT_KINDS.map((kind) => (
                <Chip
                  key={kind}
                  label={DISCOUNT_KIND_LABELS[kind]}
                  on={draft.discountKind === kind}
                  onPress={() => set({ discountKind: kind })}
                />
              ))}
            </View>
            <Input
              accessibilityLabel="Discount"
              value={draft.discount ? String(draft.discount) : ""}
              onChangeText={(text) => set({ discount: Number(text.replace(/[^0-9.]/g, "")) || 0 })}
              placeholder="0"
              keyboardType="numeric"
            />
            <Text step="caption" tone="muted">
              Leave it at nothing and the resort&apos;s own standing offers still apply.
            </Text>
          </View>
        </Card>
      ) : null}

      <Button label="Next: the money" onPress={next} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  switches: { gap: space.sm },
  fields: { gap: space.md },
  kinds: { flexDirection: "row", gap: space.sm },
});
