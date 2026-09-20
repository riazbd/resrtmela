/**
 * Everyone who has travelled with this agency.
 *
 * Counted across the whole team, not just the person looking — an
 * agency's guest list is the agency's, and a counter clerk asking "have
 * they been before?" needs the same answer the owner gets.
 *
 * The matching is the server's, always. Filtering a fetched page is how
 * a guest on row 101 comes back "no guests match", and a phone holds
 * fewer rows than a desk does, so it would get that wrong sooner.
 */
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { useApi, useDebounced } from "@rh/app-core";
import { dayLabel, formatMoney, type AgencyGuestRow } from "@rh/shared";
import { client, useAuth } from "../../../../src/api/session";
import { Input } from "../../../../src/design/input";
import { useMoneyFormat } from "../../../../src/design/money";
import { Empty, Loading, Problem, Stale } from "../../../../src/design/states";
import { Card, Row } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { space } from "../../../../src/design/tokens";

export default function AgentGuestsScreen() {
  const { me } = useAuth();
  const money = useMoneyFormat();
  const whole = (n: number) => formatMoney(n, { ...money, decimals: 0 });
  const [typed, setTyped] = useState("");

  // a keystroke is not a query; 300ms is what the console settled on and
  // a phone on a hill road has more reason to wait than a desk does
  const search = useDebounced(typed, 300);

  const list = useApi<{ rows: AgencyGuestRow[]; total: number }>(
    ["agent-guests", search],
    () => client.agent.guests({ q: search || undefined, take: 100 }),
    {
      enabled: Boolean(me),
      placeholderData: (prev: { rows: AgencyGuestRow[]; total: number } | undefined) => prev,
    },
  );

  const header = <Stack.Screen options={{ title: "Guests" }} />;

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

  const rows = list.data.rows;

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
          value={typed}
          onChangeText={setTyped}
          placeholder="Name or phone"
          autoCapitalize="none"
          accessibilityLabel="Search the guests"
        />

        <Card title={`${list.data.total} guest${list.data.total === 1 ? "" : "s"}`}>
          {rows.length === 0 ? (
            <View style={styles.emptyBox}>
              <Empty
                message={search ? "No guests match" : "No guests yet"}
                hint={
                  search
                    ? "Try part of a phone number instead."
                    : "Everyone you book a room for appears here."
                }
              />
            </View>
          ) : (
            rows.map((g, i) => (
              <Row
                key={g.id}
                title={g.fullName}
                subtitle={g.phone}
                meta={[
                  `${g.bookings} stay${g.bookings === 1 ? "" : "s"}`,
                  `${g.nights} night${g.nights === 1 ? "" : "s"}`,
                  // where they have been, which is what an agent reaches
                  // for when the guest says "the one on the hill"
                  g.resorts.length > 0 ? g.resorts.join(", ") : null,
                  g.lastStay ? `last ${dayLabel(g.lastStay, { style: "short" })}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                last={i === rows.length - 1}
                accessibilityLabel={`${g.fullName}, ${g.phone}, ${g.bookings} stays, ${whole(
                  g.spend,
                )} spent`}
                right={
                  <Text step="body" weight="medium" tone="title" tabular>
                    {whole(g.spend)}
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
  emptyBox: { paddingVertical: space.lg },
});
