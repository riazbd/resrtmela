/**
 * Step 3 — what it comes to, and taking it.
 *
 * The bill is the server's, every figure of it. Three of the numbers are
 * not on this phone: the nightly rate may be a seasonal one rather than the
 * room's base rate, an untouched discount box still picks up the resort's
 * standing offers, and the tax rules are not shipped to a client at all. A
 * sum done here would be confidently wrong in all three cases — and a bill
 * that disagrees with the invoice is worse than no bill, because the clerk
 * has already read it out to the guest.
 *
 * Which rows that bill has, and in what order, is `quoteBill` in
 * `@rh/shared`; the console's `stay-bill.tsx` draws the same rows from the
 * same function.
 */
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { keys, useApi } from "@rh/app-core";
import {
  formatMoney,
  quoteBill,
  stayRange,
  type BookingQuote,
  type QuoteRow,
  type ResortOption,
} from "@rh/shared";
import { useDraft } from "../../src/booking/draft";
import { client, useAuth } from "../../src/api/session";
import { Button } from "../../src/design/button";
import { Chip } from "../../src/design/chip";
import { Field, Input } from "../../src/design/input";
import { useMoneyFormat } from "../../src/design/money";
import { useAction } from "../../src/design/use-action";
import { Loading, Problem } from "../../src/design/states";
import { Card } from "../../src/design/surface";
import { Text } from "../../src/design/text";
import { color, radius, space } from "../../src/design/tokens";

export default function WhatItCostsScreen() {
  const { activeResort, isStaff } = useAuth();
  const resortId = activeResort?.id;
  const money = useMoneyFormat();
  const draft = useDraft();
  const { checkIn, checkOut, roomIds, rooms, set } = draft;
  const [refused, setRefused] = useState<string | null>(null);

  /**
   * Priced by the server, and re-priced whenever anything the price depends
   * on changes. Not on the advance: what the clerk is taking now is about
   * the money in the drawer, not about what the stay is worth.
   */
  const priced = useApi<BookingQuote>(
    [
      "booking-quote",
      resortId,
      roomIds.join(","),
      checkIn,
      checkOut,
      draft.adults,
      draft.children,
      draft.extraPersons,
      isStaff ? `${draft.discount}${draft.discountKind}` : null,
    ],
    () =>
      client.bookings.quote({
        resortId: resortId!,
        roomIds,
        checkIn,
        checkOut,
        adults: draft.adults,
        children: draft.children,
        extraPersons: draft.extraPersons > 0 ? draft.extraPersons : undefined,
        discount: isStaff ? draft.discount : undefined,
        discountKind: isStaff ? draft.discountKind : undefined,
      }),
    {
      enabled: resortId !== undefined && roomIds.length > 0,
      // the old figures stay on screen while the new ones are on their way,
      // rather than blanking the bill the clerk is reading out
      placeholderData: (prev: BookingQuote | undefined) => prev,
    },
  );

  const methods = useApi<ResortOption[]>(
    keys.options(resortId, "PAYMENT_METHOD"),
    () => client.options.list(resortId!, "PAYMENT_METHOD"),
    { enabled: resortId !== undefined, staleTime: 3_600_000 },
  );
  const choices = (methods.data ?? []).filter((m) => m.active);

  const guest = draft.walkIn
    ? {
        fullName: draft.guestName || "local",
        phone: draft.phone || undefined,
        email: draft.email || undefined,
      }
    : {
        fullName: draft.guestName,
        phone: draft.phone || undefined,
        email: draft.email || undefined,
        nidPassportNo: draft.nid || undefined,
      };

  const take = useAction(async () => {
    if (resortId === undefined) return;
    setRefused(null);
    try {
      if (draft.group) {
        // a tour party: one booking per room, one guest, shared terms
        const made = await client.bookings.createGroup({
          resortId,
          roomIds,
          checkIn,
          checkOut,
          adults: draft.adults,
          children: draft.children,
          guest,
          discountPerRoom: isStaff ? draft.discount : undefined,
          discountKind: isStaff ? draft.discountKind : undefined,
          advancePerRoom: draft.advance > 0 ? draft.advance : undefined,
          advanceMethod: draft.advance > 0 ? draft.advanceMethod : undefined,
          remarks: draft.remarks || undefined,
        });
        // several bookings, so there is no one booking to open; the list
        // searched by the group's tag is what a clerk wants to see next
        router.replace(`/bookings?search=${made.groupTag}`);
        return;
      }

      const made = await client.bookings.create({
        resortId,
        roomIds,
        checkIn,
        checkOut,
        adults: draft.adults,
        children: draft.children,
        walkIn: draft.walkIn,
        extraPersons: draft.extraPersons > 0 ? draft.extraPersons : undefined,
        guest,
        discount: isStaff ? draft.discount : undefined,
        discountKind: isStaff ? draft.discountKind : undefined,
        remarks: draft.remarks || undefined,
        advancePayment:
          draft.advance > 0
            ? { amount: draft.advance, method: draft.advanceMethod }
            : undefined,
      });
      // `replace`, not `push`: backing out of a booking that now exists and
      // landing on the form that made it is how it gets made twice
      router.replace(`/bookings/${made.id}`);
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That did not go through.");
    }
  });

  /**
   * Whole taka throughout. `quoteBill` formats the working-out with the
   * format it is handed and nothing else, so handing it the resort's
   * default while the amounts beside it are drawn without paise prints
   * "2 nights × ৳6,500.00 … ৳13,000" on one line — which reads as two
   * different currencies rather than one bill.
   */
  const whole = { ...money, decimals: 0 };

  /** "3 adults, 1 child" — children only when there are some. */
  const heads = [
    `${draft.adults} adult${draft.adults === 1 ? "" : "s"}`,
    draft.children > 0 ? `${draft.children} child${draft.children === 1 ? "" : "ren"}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const bill = priced.data ? quoteBill(priced.data, { advance: draft.advance, money: whole }) : null;

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Card title="This stay">
        {/*
          Who, when, how many — read back before the button that creates it.
          This screen said the room and the nights and nothing else until
          somebody looked at it: a clerk should not have to go two screens
          up to check whose booking they are about to take.
        */}
        <Text step="small" tone="muted" style={styles.whose}>
          {[draft.guestName || "—", stayRange(checkIn, checkOut), heads].join(" · ")}
        </Text>
        {priced.error && !priced.data ? (
          <Problem error={priced.error} onRetry={() => void priced.refetch()} />
        ) : !bill ? (
          <Loading what="what the stay comes to" />
        ) : (
          <View style={[styles.bill, priced.isFetching ? styles.settling : null]}>
            {bill.map((row) => (
              <BillRow key={row.id} row={row} money={whole} />
            ))}
          </View>
        )}
      </Card>

      <Card title="Advance">
        <View style={styles.fields}>
          {/* not "Advance now": the bill above already has a row of that
              name, and the same words twice on one screen is a screen
              reader announcing the same thing about two different things */}
          <Field label="How much" hint="Leave it at nothing if they are paying later">
            <Input
              value={draft.advance ? String(draft.advance) : ""}
              onChangeText={(text) => set({ advance: Number(text.replace(/[^0-9.]/g, "")) || 0 })}
              placeholder="0"
              keyboardType="numeric"
            />
          </Field>
          {draft.advance > 0 ? (
            <View style={styles.methods}>
              {choices.map((method) => (
                <Chip
                  key={method.code}
                  label={method.label}
                  on={draft.advanceMethod === method.code}
                  onPress={() => set({ advanceMethod: method.code })}
                />
              ))}
            </View>
          ) : null}
          <Field label="Remarks" hint="Optional — anything the desk should know">
            <Input
              value={draft.remarks}
              onChangeText={(remarks) => set({ remarks })}
              placeholder="Late arrival, sea-facing requested…"
            />
          </Field>
        </View>
      </Card>

      {refused ? (
        <View style={styles.refused}>
          <Text step="small" tone="danger" weight="medium">
            {refused}
          </Text>
        </View>
      ) : null}

      <Button
        label={
          draft.group
            ? `Take the booking (${rooms.length} rooms, one each)`
            : `Take the booking${rooms.length > 1 ? ` (${rooms.length} rooms)` : ""}`
        }
        loading={take.busy}
        onPress={take.go}
      />
    </ScrollView>
  );
}

/**
 * One line of the bill.
 *
 * The whole row is one phrase to a screen reader — "1 Camellia, 2 nights ×
 * ৳6,500, ৳13,000" — because a bill read out as label, working, amount,
 * label, working, amount leaves the listener to pair thirty announcements.
 */
function BillRow({ row, money }: { row: QuoteRow; money: Parameters<typeof formatMoney>[1] }) {
  const figure = `${row.deduction ? "−" : ""}${formatMoney(row.amount, money)}`;
  const heavy = row.kind === "total" || row.kind === "due";

  return (
    <View
      accessibilityLabel={[row.label, row.detail, figure].filter(Boolean).join(", ")}
      style={[styles.row, row.kind === "total" ? styles.ruled : null]}
    >
      <View style={styles.what}>
        <Text step={heavy ? "body" : "small"} weight={heavy ? "medium" : "regular"} tone={heavy ? "title" : "body"}>
          {row.label}
        </Text>
        {row.detail ? (
          <Text step="caption" tone="muted">
            {row.detail}
          </Text>
        ) : null}
      </View>
      <Text
        step={row.kind === "total" ? "strong" : "body"}
        weight={heavy ? "medium" : "regular"}
        tone={row.kind === "due" ? "danger" : row.kind === "discount" ? "ok" : heavy ? "title" : "body"}
        tabular
      >
        {figure}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  whose: { marginBottom: space.sm },
  bill: { gap: space.xs },
  // a stale bill stays readable rather than blanking: the clerk is saying it
  // out loud while the next quote is in flight
  settling: { opacity: 0.5 },
  row: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.md,
    paddingVertical: 2,
  },
  ruled: { borderTopWidth: 1, borderTopColor: color.line, paddingTop: space.sm, marginTop: space.xs },
  what: { flex: 1, gap: 1 },
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
