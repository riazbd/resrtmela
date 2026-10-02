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
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { keys, useApi, useDebounced } from "@rh/app-core";
import {
  BOOKING_SORTS,
  BOOKING_STATES,
  DEFAULT_BOOKING_SORT,
  bookingStateLabel,
  dayLabel,
  formatMoney,
  type BookingRow,
  type ResortOption,
} from "@rh/shared";
import { client, useAuth } from "../../src/api/session";
import { WhichResort } from "../../src/screens/which-resort";
import { Button } from "../../src/design/button";
import { Input } from "../../src/design/input";
import { useMoneyFormat } from "../../src/design/money";
import { Chip } from "../../src/design/chip";
import { Empty, Loading, Problem, Stale } from "../../src/design/states";
import { Card, Row } from "../../src/design/surface";
import { Text } from "../../src/design/text";
import { color, elevation, radius, space } from "../../src/design/tokens";
import { BookingsGlance } from "../../src/screens/glance";

export default function BookingsScreen() {
  const { activeResort } = useAuth();
  const resortId = activeResort?.id;
  const money = useMoneyFormat();
  const whole = useCallback(
    (amount: number) => formatMoney(amount, { ...money, decimals: 0 }),
    [money],
  );

  /**
   * A search somebody was sent here with.
   *
   * Taking a group makes one booking per room, so there is no single
   * booking to open and the form sends the clerk here searched by the
   * group's tag. It used to send them to the whole list: the parameter was
   * written and never read, so the two bookings just taken were somewhere
   * among the ninety. A starting point, not a lock — the box clears.
   */
  const { search: sentWith } = useLocalSearchParams<{ search?: string }>();
  const [typed, setTyped] = useState(typeof sentWith === "string" ? sentWith : "");
  const [state, setState] = useState<string | null>(null);
  const [sort, setSort] = useState<string>(DEFAULT_BOOKING_SORT);
  const [source, setSource] = useState<string | null>(null);
  const [groupTyped, setGroupTyped] = useState("");
  const [fromTyped, setFromTyped] = useState("");
  const [toTyped, setToTyped] = useState("");
  const group = useDebounced(groupTyped.trim(), 400);
  // a date half typed is not a filter; only a whole one is sent
  const from = /^\d{4}-\d{2}-\d{2}$/.test(fromTyped) ? fromTyped : "";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(toTyped) ? toTyped : "";
  const sources = useApi<ResortOption[]>(
    keys.options(resortId, "BOOKING_SOURCE"),
    () => client.options.list(resortId!, "BOOKING_SOURCE"),
    { enabled: resortId !== undefined, staleTime: 3_600_000 },
  );
  const [filtering, setFiltering] = useState(false);

  // a keystroke is not a query; the console settled on 300ms and a phone on a
  // hill-district connection has more reason to wait than a desk does
  const search = useDebounced(typed, 300);

  const list = useApi(
    keys.bookings(resortId, { search, state, sort, source, group, from, to }),
    () =>
      client.bookings.list({
        resortId: resortId!,
        take: 100,
        // `undefined`, never `""`: the API's validators treat an absent
        // parameter differently from an empty one, and leaning on the query
        // builder to clean up is how the next caller gets it wrong
        search: search || undefined,
        state: state ?? undefined,
        source: source ?? undefined,
        group: group || undefined,
        from: from || undefined,
        to: to || undefined,
        sort,
      }),
    {
      enabled: resortId !== undefined,
      // the previous filter's rows stay on screen while the next set loads,
      // so changing a filter does not blank the list being read from
      placeholderData: (prev) => prev,
    },
  );

  /**
   * No `title` here. A tab is named by the bar, which runs the
   * console's label through `barLabel` so it fits; a title set on the
   * screen overrides that from underneath and the bar goes back to
   * an ellipsis. `a-tab-does-not-name-itself.spec.ts` is the rule.
   */
  const header = null;

  if (resortId === undefined) {
    return (
      <>
        {header}
        <WhichResort what="the bookings" />
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
  const narrowed = Boolean(search) || state !== null || source !== null || Boolean(group) || Boolean(from) || Boolean(to);
  /** the list's make-up by state, drawn above it — how much of it is in house, pending, gone */

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
            <View style={styles.sortHead}>
              <Text step="small" tone="muted" weight="medium">
                Where it came from
              </Text>
            </View>
            <View style={styles.chips}>
              {(sources.data ?? []).filter((o) => o.active).map((o) => (
                <Chip key={o.code} label={o.label} on={source === o.code} onPress={() => setSource((now) => (now === o.code ? null : o.code))} />
              ))}
            </View>
            <View style={styles.dates}>
              <View style={styles.search}>
                <Input accessibilityLabel="Check-in from" placeholder="From 2026-10-01" value={fromTyped} onChangeText={setFromTyped} autoCapitalize="none" />
              </View>
              <View style={styles.search}>
                <Input accessibilityLabel="Check-in to" placeholder="To 2026-10-31" value={toTyped} onChangeText={setToTyped} autoCapitalize="none" />
              </View>
            </View>
            <Input accessibilityLabel="Group tag" placeholder="Group tag, like GRP-0001" value={groupTyped} onChangeText={setGroupTyped} autoCapitalize="characters" />
            {narrowed ? (
              <Button
                label="Clear the filter"
                kind="subtle"
                onPress={() => {
                  setState(null);
                  setSource(null);
                  setGroupTyped("");
                  setFromTyped("");
                  setToTyped("");
                }}
              />
            ) : null}
          </Card>
        ) : null}

        <BookingsGlance rows={rows} total={total} money={whole} sourceLabel={(c) => sources.data?.find((o) => o.code === c)?.label ?? c} />

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
            <View style={styles.cards}>
              {rows.map((b) => (
                <BookingListRow key={b.id} booking={b} whole={whole} />
              ))}
            </View>
          )}
        </Card>
      </ScrollView>
    </>
  );
}

/** A booking's state as a colour, drawn down the card's edge and in the mix above the list. */
const STATE_TONE: Record<string, string> = {
  PENDING: color.chart.money.left.solid,
  CONFIRMED: color.chart.money.paid.solid,
  CHECKED_IN: color.chart.money.advance.solid,
  CHECKED_OUT: color.ink[400],
  CANCELLED: color.chart.money.late.solid,
  NO_SHOW: color.chart.money.deduction.solid,
};

function BookingListRow({ booking, whole }: { booking: BookingRow; whole: (amount: number) => string }) {
  // an imported booking can have no guest and no rooms; reaching for
  // `.fullName` here is how one row once took a whole page down
  const who = booking.guest?.fullName ?? "—";
  const where = booking.rooms.filter(Boolean).join(", ") || "—";
  const when = `${dayLabel(booking.checkIn)} → ${dayLabel(booking.checkOut)}`;
  const status = bookingStateLabel(booking.state);
  const tone = STATE_TONE[booking.state] ?? color.ink[400];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${who}, ${booking.code}, ${status}, ${whole(booking.due)} due`}
      onPress={() => router.push(`/bookings/${booking.id}` as never)}
      style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
    >
      <View style={[styles.edge, { backgroundColor: tone }]} />
      <View style={[styles.avatar, { backgroundColor: tone }]}>
        <Text step="body" weight="bold" tone="onBrand">
          {(booking.guest?.fullName ?? "#").slice(0, 1).toUpperCase()}
        </Text>
      </View>
      <View style={styles.cardBody}>
        <Text step="body" weight="bold" tone="title" numberOfLines={1}>
          {who}
        </Text>
        <Text step="caption" tone="muted" numberOfLines={1}>
          {`${booking.code} · ${where}`}
        </Text>
        <Text step="caption" tone="body" numberOfLines={1}>
          {when}
        </Text>
      </View>
      <View style={styles.cardRight}>
        <View style={[styles.statePill, { borderColor: tone }]}>
          <Text step="caption" weight="bold" numberOfLines={1} style={{ color: tone }}>
            {status}
          </Text>
        </View>
        <Text step="body" weight="bold" tone={booking.due > 0 ? "danger" : "ok"} tabular numberOfLines={1}>
          {booking.due > 0 ? whole(booking.due) : "Paid"}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  searchRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  search: { flex: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, paddingBottom: space.sm },
  sortHead: { paddingTop: space.xs, paddingBottom: space.xs },
  emptyBox: { paddingVertical: space.lg },
  dates: { flexDirection: "row", gap: space.sm, paddingBottom: space.sm },
  cards: { gap: space.sm },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    padding: space.md,
    paddingLeft: space.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: color.ink[100],
    ...elevation.raised,
  },
  pressed: { opacity: 0.7 },
  edge: { position: "absolute", left: 0, top: 0, bottom: 0, width: 5 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  cardBody: { flex: 1, gap: 2 },
  cardRight: { alignItems: "flex-end", gap: space.xs },
  statePill: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 1 },
});
