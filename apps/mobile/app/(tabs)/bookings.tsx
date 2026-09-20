/**
 * Every booking, and the two ways a clerk narrows them down.
 *
 * The console gives this seven filters across a toolbar. A phone has room
 * for the two somebody standing at a counter actually reaches for — a search
 * box and which state to show — plus the order, which is the thing the list
 * got wrong for months: it read check-in descending, so a booking taken this
 * morning for next March sat wherever March fell.
 *
 * The matching is the server's, always. Filtering a fetched page is how a
 * guest on row 101 came back "no bookings match", and a phone holds fewer
 * rows than a desk does, so it would get that wrong sooner.
 */
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, router } from "expo-router";
import { keys, useApi, useDebounced } from "@rh/app-core";
import {
  BOOKING_SORTS,
  BOOKING_STATES,
  DEFAULT_BOOKING_SORT,
  bookingStateLabel,
  dayLabel,
  formatMoney,
  type BookingRow,
} from "@rh/shared";
import { client, useAuth } from "../../src/api/session";
import { Button } from "../../src/design/button";
import { Input } from "../../src/design/input";
import { useMoneyFormat } from "../../src/design/money";
import { Chip } from "../../src/design/chip";
import { Empty, Loading, Problem, Stale } from "../../src/design/states";
import { Card, Row } from "../../src/design/surface";
import { Text } from "../../src/design/text";
import { space } from "../../src/design/tokens";

export default function BookingsScreen() {
  const { activeResort } = useAuth();
  const resortId = activeResort?.id;
  const money = useMoneyFormat();
  const whole = useCallback(
    (amount: number) => formatMoney(amount, { ...money, decimals: 0 }),
    [money],
  );

  const [typed, setTyped] = useState("");
  const [state, setState] = useState<string | null>(null);
  const [sort, setSort] = useState<string>(DEFAULT_BOOKING_SORT);
  const [filtering, setFiltering] = useState(false);

  // a keystroke is not a query; the console settled on 300ms and a phone on a
  // hill-district connection has more reason to wait than a desk does
  const search = useDebounced(typed, 300);

  const list = useApi(
    keys.bookings(resortId, { search, state, sort }),
    () =>
      client.bookings.list({
        resortId: resortId!,
        take: 100,
        // `undefined`, never `""`: the API's validators treat an absent
        // parameter differently from an empty one, and leaning on the query
        // builder to clean up is how the next caller gets it wrong
        search: search || undefined,
        state: state ?? undefined,
        sort,
      }),
    {
      enabled: resortId !== undefined,
      // the previous filter's rows stay on screen while the next set loads,
      // so changing a filter does not blank the list being read from
      placeholderData: (prev) => prev,
    },
  );

  const header = <Stack.Screen options={{ title: "Bookings" }} />;

  if (resortId === undefined) {
    return (
      <>
        {header}
        <Empty
          message="No resort selected"
          hint="Choose a resort from the More tab, or ask the owner to add you to one."
        />
      </>
    );
  }
  if (list.error && !list.data) {
    return (
      <>
        {header}
        <Problem error={list.error} onRetry={() => void list.refetch()} />
      </>
    );
  }
  if (!list.data) {
    return (
      <>
        {header}
        <Loading what="the bookings" />
      </>
    );
  }

  const rows = list.data.rows ?? [];
  const total = list.data.total ?? rows.length;
  const narrowed = Boolean(search) || state !== null;

  return (
    <>
      {header}
      <Stale age={list.stale} />
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />
        }
      >
        <View style={styles.searchRow}>
          <Input
            accessibilityLabel="Search bookings"
            placeholder="Guest, phone or booking no."
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={styles.search}
          />
          <Button
            label="Filter"
            kind={narrowed ? "primary" : "ghost"}
            block={false}
            onPress={() => setFiltering((open) => !open)}
          />
          {/* the way into the three-step form; the day sheet has the other,
              where a clerk taps the free room they have already chosen */}
          <Button
            label="New"
            block={false}
            onPress={() => router.push("/new-booking" as never)}
          />
        </View>

        {filtering ? (
          <Card title="Show">
            <View style={styles.chips}>
              {BOOKING_STATES.map((s) => (
                <Chip
                  key={s}
                  // the label is what a person reads; `s` is what gets sent.
                  // An option that sends its own text is how this filter once
                  // asked the API for CHECKED-IN
                  label={bookingStateLabel(s)}
                  on={state === s}
                  onPress={() => setState((now) => (now === s ? null : s))}
                />
              ))}
            </View>
            <View style={styles.sortHead}>
              <Text step="small" tone="muted" weight="medium">
                Order
              </Text>
            </View>
            <View style={styles.chips}>
              {BOOKING_SORTS.map((s) => (
                <Chip key={s.key} label={s.label} on={sort === s.key} onPress={() => setSort(s.key)} />
              ))}
            </View>
          </Card>
        ) : null}

        <Card title={`${total} booking${total === 1 ? "" : "s"}`}>
          {rows.length === 0 ? (
            <View style={styles.emptyBox}>
              <Empty
                message={narrowed ? "Nothing matches that" : "No bookings yet"}
                hint={
                  narrowed
                    ? "Try fewer words, or clear the filter."
                    : "Take the resort's first booking and it appears here."
                }
              />
            </View>
          ) : (
            rows.map((b, i) => (
              <BookingListRow key={b.id} booking={b} last={i === rows.length - 1} whole={whole} />
            ))
          )}
        </Card>
      </ScrollView>
    </>
  );
}

function BookingListRow({
  booking,
  last,
  whole,
}: {
  booking: BookingRow;
  last: boolean;
  whole: (amount: number) => string;
}) {
  // an imported booking can have no guest and no rooms; reaching for
  // `.fullName` here is how one row once took a whole page down
  const who = booking.guest?.fullName ?? "—";
  const where = booking.rooms.filter(Boolean).join(", ") || "—";
  const when = `${dayLabel(booking.checkIn)} → ${dayLabel(booking.checkOut)}`;
  const status = bookingStateLabel(booking.state);

  return (
    <Row
      title={who}
      subtitle={`${booking.code} · ${status}`}
      meta={`${when} · ${where}`}
      last={last}
      accessibilityLabel={`${who}, ${booking.code}, ${status}, ${whole(booking.due)} due`}
      onPress={() => router.push(`/bookings/${booking.id}` as never)}
      right={
        <Text
          step="body"
          weight="medium"
          tone={booking.due > 0 ? "danger" : "ok"}
          tabular
        >
          {whole(booking.due)}
        </Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  searchRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  search: { flex: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, paddingBottom: space.sm },
  sortHead: { paddingTop: space.xs, paddingBottom: space.xs },
  emptyBox: { paddingVertical: space.lg },
});
