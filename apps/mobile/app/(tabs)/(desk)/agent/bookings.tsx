/**
 * What this agency has sold.
 *
 * The resort's own booking list needs a resort, and an agency sells across
 * several — so an agent could write a quotation, convert it, raise the
 * invoice, and then have no list anywhere that showed the stay behind it.
 * The owner asked for this screen by the name it has here: my bookings.
 *
 * "This agency", not "me": an owner sees what their staff sold, which is the
 * rule the API's own filter and the guest list already run on.
 *
 * The resort is on every row and not in a heading, because with all of them
 * on one list "102" is a room at three different hotels.
 *
 * The matching is the server's, always. Filtering a fetched page is how a
 * guest on row 101 comes back "nothing matches", and a phone holds fewer
 * rows than a desk does.
 */
import { useState } from "react";
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
  type AgencyBookingRow,
  type Page,
} from "@rh/shared";
import { client, useAuth } from "../../../../src/api/session";
import { Button } from "../../../../src/design/button";
import { Chip } from "../../../../src/design/chip";
import { Input } from "../../../../src/design/input";
import { useMoneyFormat } from "../../../../src/design/money";
import { Empty, Loading, Problem, Stale } from "../../../../src/design/states";
import { Card, Row } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { space } from "../../../../src/design/tokens";

export default function AgencyBookingsScreen() {
  const { me } = useAuth();
  const money = useMoneyFormat();
  const whole = (amount: number) => formatMoney(amount, { ...money, decimals: 0 });

  const [typed, setTyped] = useState("");
  const [state, setState] = useState<string | null>(null);
  const [resortId, setResortId] = useState<number | null>(null);
  const [sort, setSort] = useState<string>(DEFAULT_BOOKING_SORT);
  const [filtering, setFiltering] = useState(false);

  // a keystroke is not a query; the same 300ms the desk settled on
  const search = useDebounced(typed, 300);
  const narrowed = Boolean(search || state || resortId);

  /** The resorts this agency sells, which the session already knows. */
  const resorts = (me?.resorts ?? []).map((r) => r.resort);

  const query = {
    search: search || undefined,
    state: state ?? undefined,
    resortId: resortId ?? undefined,
    sort,
    take: 100,
  };
  const list = useApi<Page<AgencyBookingRow>>(
    keys.agentBookings(query),
    () => client.agent.bookings(query),
    {
      enabled: Boolean(me),
      placeholderData: (prev: Page<AgencyBookingRow> | undefined) => prev,
    },
  );

  const header = <Stack.Screen options={{ title: "My bookings" }} />;

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
        <Loading what="your bookings" />
      </>
    );
  }

  const rows = list.data.rows;
  const total = list.data.total;

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
            accessibilityLabel="Search your bookings"
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
        </View>

        {filtering ? (
          <Card title="Show">
            {resorts.length > 1 ? (
              <View style={styles.chips}>
                <Chip
                  label="Every resort"
                  on={resortId === null}
                  onPress={() => setResortId(null)}
                />
                {resorts.map((r) => (
                  <Chip
                    key={r.id}
                    label={r.name}
                    on={resortId === r.id}
                    onPress={() => setResortId((now) => (now === r.id ? null : r.id))}
                  />
                ))}
              </View>
            ) : null}
            <View style={styles.head}>
              <Text step="small" tone="muted" weight="medium">
                Status
              </Text>
            </View>
            <View style={styles.chips}>
              {BOOKING_STATES.map((s) => (
                <Chip
                  key={s}
                  // the label is read; `s` is sent. An option that sends its
                  // own text is how the desk's filter once asked for CHECKED-IN
                  label={bookingStateLabel(s)}
                  on={state === s}
                  onPress={() => setState((now) => (now === s ? null : s))}
                />
              ))}
            </View>
            <View style={styles.head}>
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
                    : "Every stay you sell appears here."
                }
              />
            </View>
          ) : (
            rows.map((b, i) => (
              <AgencyBookingListRow
                key={b.id}
                booking={b}
                last={i === rows.length - 1}
                whole={whole}
              />
            ))
          )}
        </Card>
      </ScrollView>
    </>
  );
}

function AgencyBookingListRow({
  booking,
  last,
  whole,
}: {
  booking: AgencyBookingRow;
  last: boolean;
  whole: (amount: number) => string;
}) {
  // an imported booking can have no guest and no rooms; reaching for
  // `.fullName` here is how one row once took a whole page down
  const who = booking.guest?.fullName ?? "—";
  const where = booking.rooms.filter(Boolean).join(", ") || "—";
  const when = `${dayLabel(booking.checkIn)} → ${dayLabel(booking.checkOut)}`;
  const status = bookingStateLabel(booking.state);
  const at = booking.resort?.name ?? "—";

  return (
    <Row
      title={who}
      subtitle={`${booking.code} · ${status}`}
      // the resort first: it is what tells two "102"s apart
      meta={`${at} · ${when} · ${where}`}
      last={last}
      accessibilityLabel={`${who}, ${booking.code} at ${at}, ${status}, ${whole(
        booking.due,
      )} due`}
      onPress={() => router.push(`/bookings/${booking.id}` as never)}
      right={
        <Text step="body" weight="medium" tone={booking.due > 0 ? "danger" : "ok"} tabular>
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
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  head: { paddingTop: space.md, paddingBottom: space.xs },
  emptyBox: { paddingVertical: space.lg },
});
