/**
 * One guest, and every stay they have had.
 *
 * There is no `GET /guests/:id`. The console never needed one — its guests
 * page is a table and stops there — and adding a route to the API so that
 * a phone screen can avoid a query parameter would be the wrong way round.
 *
 * So this screen is assembled from two routes that do exist: the guests
 * list narrowed to this person, and the bookings list searched by the same
 * phone number, which is exactly what `GET /bookings?search=` matches on.
 * The phone travels in the URL because it is the key, and the name travels
 * with it so the header has something to say before either answer lands.
 *
 * A deep link with no phone says so rather than showing an empty page: the
 * screen genuinely cannot do its job without it, and pretending otherwise
 * would read as "this guest has never stayed".
 */
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { keys, useApi } from "@rh/app-core";
import {
  bookingStateLabel,
  dayLabel,
  formatMoney,
  stayRange,
  type BookingRow,
} from "@rh/shared";
import { client, useAuth } from "../../src/api/session";
import { WhichResort } from "../../src/screens/which-resort";
import { Button } from "../../src/design/button";
import { useMoneyFormat } from "../../src/design/money";
import { Empty, Loading, Problem } from "../../src/design/states";
import { Card, Row, Stat } from "../../src/design/surface";
import { Text } from "../../src/design/text";
import { space } from "../../src/design/tokens";

export default function GuestScreen() {
  const { id, phone, name } = useLocalSearchParams<{
    id?: string;
    phone?: string;
    name?: string;
  }>();
  const guestId = Number(id);
  const { activeResort } = useAuth();
  const resortId = activeResort?.id;
  const money = useMoneyFormat();

  const header = <Stack.Screen options={{ title: name || "Guest" }} />;

  const who = useApi(
    keys.guests(resortId, `one:${phone}`),
    () => client.guests.list(resortId!, { search: phone!, take: 20 }),
    { enabled: resortId !== undefined && Boolean(phone) },
  );

  const stays = useApi(
    keys.bookings(resortId, { guest: phone }),
    () => client.bookings.list({ resortId: resortId!, search: phone!, take: 50 }),
    { enabled: resortId !== undefined && Boolean(phone) },
  );

  if (resortId === undefined) {
    return (
      <>
        {header}
        <WhichResort what="the guest" />
      </>
    );
  }

  if (!phone) {
    return (
      <>
        {header}
        <View style={styles.middle}>
          <Empty
            message="Open this guest from the list"
            hint="A guest is found by their phone number, and this link carries none."
          />
          <Button label="All guests" kind="ghost" onPress={() => router.replace("/guests")} />
        </View>
      </>
    );
  }

  if (who.error && !who.data) {
    return (
      <>
        {header}
        <Problem error={who.error} onRetry={() => void who.refetch()} />
      </>
    );
  }

  if (!who.data) {
    return (
      <>
        {header}
        <Loading what="the guest" />
      </>
    );
  }

  // the search is a phone number, so it matches this person; the id is what
  // makes sure of it when two guests share a household phone
  const guest =
    who.data.rows.find((g) => g.id === guestId) ??
    who.data.rows.find((g) => g.phone === phone) ??
    null;

  if (!guest) {
    return (
      <>
        {header}
        <View style={styles.middle}>
          <Empty message="Guest not found" hint="They may have been removed since the list loaded." />
          <Button label="All guests" kind="ghost" onPress={() => router.replace("/guests")} />
        </View>
      </>
    );
  }

  const rows: BookingRow[] = stays.data?.rows ?? [];
  const owed = rows.reduce((sum, b) => sum + (b.due ?? 0), 0);
  const whole = (n: number) => formatMoney(n, { ...money, decimals: 0 });

  return (
    <>
      {header}
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={
          <RefreshControl
            refreshing={who.isRefetching || stays.isRefetching}
            onRefresh={() => {
              void who.refetch();
              void stays.refetch();
            }}
          />
        }
      >
        <Card>
          <Text step="title" weight="bold" tone="title">
            {guest.fullName}
          </Text>
          <View style={styles.facts}>
            <Row title="Phone" meta={guest.phone || "—"} accessibilityLabel={`Phone: ${guest.phone || "none"}`} />
            <Row
              title="NID / Passport"
              meta={guest.nidPassportNo ?? "—"}
              last
              accessibilityLabel={`NID or passport: ${guest.nidPassportNo ?? "none"}`}
            />
          </View>
        </Card>

        <View style={styles.figures}>
          <Stat label="Stays" value={String(guest.bookingCount)} />
          <Stat
            label="Last stay"
            value={guest.lastStay ? dayLabel(guest.lastStay.checkIn) : "—"}
            sub={guest.lastStay ? bookingStateLabel(guest.lastStay.state) : undefined}
          />
          {/* summed from the rows on this page, and said to be, because the
              bookings route sends no total of what a guest owes */}
          <Stat label="Owed on these" value={whole(owed)} tone={owed > 0 ? "danger" : "title"} />
        </View>

        <Card title="Stays">
          {stays.error && !stays.data ? (
            <Problem error={stays.error} onRetry={() => void stays.refetch()} />
          ) : !stays.data ? (
            <Loading what="their stays" />
          ) : rows.length === 0 ? (
            <View style={styles.emptyBox}>
              <Empty message="No bookings found for this number" />
            </View>
          ) : (
            rows.map((booking, i) => (
              <Row
                key={booking.id}
                title={`${booking.code} · ${bookingStateLabel(booking.state)}`}
                subtitle={`${stayRange(booking.checkIn, booking.checkOut)}${
                  booking.rooms?.length ? ` · ${booking.rooms.join(", ")}` : ""
                }`}
                last={i === rows.length - 1}
                accessibilityLabel={`${booking.code}, ${bookingStateLabel(booking.state)}, ${stayRange(booking.checkIn, booking.checkOut)}, ${whole(booking.due ?? 0)} due`}
                onPress={() => router.push(`/bookings/${booking.id}` as never)}
                right={
                  <Text
                    step="body"
                    weight="medium"
                    tone={(booking.due ?? 0) > 0 ? "danger" : "muted"}
                    tabular
                  >
                    {whole(booking.due ?? 0)}
                  </Text>
                }
              />
            ))
          )}
        </Card>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  middle: { flex: 1, justifyContent: "center", alignItems: "center", gap: space.md, padding: space.lg },
  facts: { paddingTop: space.md },
  figures: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  emptyBox: { paddingVertical: space.lg },
});
