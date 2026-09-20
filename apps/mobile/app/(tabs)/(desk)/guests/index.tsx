/**
 * Everyone who has stayed.
 *
 * Asked at the counter constantly — "have they been before?", "what's
 * their number?" — and the console answers it with a five-column table and
 * a search box. A phone keeps the search box and puts the four facts on
 * two lines: who, how to reach them, how many times, and when last.
 *
 * The matching is the server's, always. Filtering a fetched page is how a
 * guest on row 101 comes back "no guests match", and a phone holds fewer
 * rows than a desk does, so it would get that wrong sooner.
 */
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, router } from "expo-router";
import { keys, useApi, useDebounced } from "@rh/app-core";
import { dayLabel, type GuestRow, type Page } from "@rh/shared";
import { client, useAuth } from "../../../../src/api/session";
import { WhichResort } from "../../../../src/screens/which-resort";
import { Input } from "../../../../src/design/input";
import { Empty, Loading, Problem, Stale } from "../../../../src/design/states";
import { Card, Row } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { space } from "../../../../src/design/tokens";

export default function GuestsScreen() {
  const { activeResort } = useAuth();
  const resortId = activeResort?.id;
  const [typed, setTyped] = useState("");

  // a keystroke is not a query; the console settled on 300ms and a phone on
  // a hill-district connection has more reason to wait than a desk does
  const search = useDebounced(typed, 300);

  const list = useApi(
    keys.guests(resortId, search),
    () => client.guests.list(resortId!, { search: search || undefined, take: 100 }),
    {
      enabled: resortId !== undefined,
      // the previous rows stay on screen while the next set loads, rather
      // than blanking the list on every keystroke
      placeholderData: (prev: Page<GuestRow> | undefined) => prev,
    },
  );

  const header = <Stack.Screen options={{ title: "Guests" }} />;

  if (resortId === undefined) {
    return (
      <>
        {header}
        <WhichResort what="the guests" />
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
        <Loading what="the guests" />
      </>
    );
  }

  const rows = list.data.rows ?? [];
  const total = list.data.total ?? rows.length;

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
        <Input
          accessibilityLabel="Search guests"
          placeholder="Name, phone or NID"
          value={typed}
          onChangeText={setTyped}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />

        <Card title={`${total} guest${total === 1 ? "" : "s"}`}>
          {rows.length === 0 ? (
            <View style={styles.emptyBox}>
              {/* an empty search is not an empty resort, and saying "no
                  guests yet" over a resort with four hundred is worse than
                  saying nothing */}
              <Empty
                message={search ? "Nothing matches that" : "No guests yet"}
                hint={
                  search
                    ? "Try a phone number, or part of a name."
                    : "A guest appears here the first time a booking is taken for them."
                }
              />
            </View>
          ) : (
            rows.map((guest, i) => (
              <GuestLine key={guest.id} guest={guest} last={i === rows.length - 1} />
            ))
          )}
        </Card>
      </ScrollView>
    </>
  );
}

function GuestLine({ guest, last }: { guest: GuestRow; last: boolean }) {
  const stays = `${guest.bookingCount} stay${guest.bookingCount === 1 ? "" : "s"}`;
  const last_ = guest.lastStay ? `last ${dayLabel(guest.lastStay.checkIn)}` : "never stayed";

  return (
    <Row
      title={guest.fullName}
      subtitle={guest.phone || undefined}
      meta={guest.nidPassportNo ?? undefined}
      last={last}
      accessibilityLabel={`${guest.fullName}, ${guest.phone || "no phone"}, ${stays}, ${last_}`}
      onPress={
        // a guest is looked up to find their stays, and the only way to
        // find those is by what the bookings route searches on
        guest.phone
          ? () =>
              router.push(
                `/guests/${guest.id}?phone=${encodeURIComponent(guest.phone)}&name=${encodeURIComponent(guest.fullName)}` as never,
              )
          : undefined
      }
      right={
        <View style={styles.right}>
          <Text step="body" weight="medium" tone="title" tabular>
            {guest.bookingCount}
          </Text>
          <Text step="caption" tone="muted">
            {guest.lastStay ? dayLabel(guest.lastStay.checkIn) : "—"}
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  right: { alignItems: "flex-end", gap: 2 },
  emptyBox: { paddingVertical: space.lg },
});
