/**
 * An agent's own figures at the resort they are working in — the console's
 * agent Profile page, on the phone's profile.
 *
 * The commission terms, what the agent has sold and earned (the server's own
 * report, over every booking, through the one commission function), and the
 * latest bookings. Who works at the agency is on My team.
 */
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { keys, useApi } from "@rh/app-core";
import { bookingStateLabel, dayLabel, formatMoney, type AgentOwnReport, type BookingRow } from "@rh/shared";
import { client, useAuth } from "../api/session";
import { Kpi } from "../design/charts";
import { useMoneyFormat } from "../design/money";
import { Card, Row } from "../design/surface";
import { Text } from "../design/text";
import { color, space } from "../design/tokens";

export function AgentProfileCards() {
  const { activeResort, isAgent } = useAuth();
  const rid = activeResort?.id;
  const money = useMoneyFormat();
  const whole = (n: number) => formatMoney(n, { ...money, decimals: 0 });
  const report = useApi<AgentOwnReport>(keys.reports(rid, "mine"), () => client.reports.mine(rid!), {
    enabled: isAgent && rid !== undefined,
  });
  const recent = useApi(keys.bookings(rid, { mine: true, take: 15 }), () => client.bookings.list({ resortId: rid!, take: 15 }), {
    enabled: isAgent && rid !== undefined,
  });
  if (!isAgent || rid === undefined) return null;
  const r = report.data;
  const rows: BookingRow[] = recent.data?.rows ?? [];
  const active = rows.filter((b) => b.state === "CONFIRMED" || b.state === "CHECKED_IN").length;

  return (
    <>
      <Card title={`At ${activeResort?.name ?? "the resort"}`}>
        <Text step="small" tone="muted">
          Commission terms
        </Text>
        <Text step="figure" weight="bold" tone="ok" tabular>
          {r ? (r.commissionKind === "FLAT" ? `${whole(r.commissionRate)} a booking` : `${r.commissionRate}% of rent`) : "—"}
        </Text>
      </Card>
      {r ? (
        <View style={styles.figures}>
          <Kpi label="My bookings" value={String(r.bookings)} tint={color.title} />
          <Kpi label="Active" value={String(active)} tint={color.chart.money.advance.solid} sub="of the latest" />
          <Kpi label="Sold rent" value={whole(r.rent)} tint={color.chart.money.income.solid} />
          <Kpi label="Commission" value={whole(r.commission)} tint={color.chart.money.paid.solid} />
        </View>
      ) : null}
      <Card title="My recent bookings">
        {rows.length === 0 ? (
          <Text step="small" tone="muted">
            No bookings yet.
          </Text>
        ) : (
          rows.map((b, i) => (
            <Row
              key={b.id}
              title={b.guest?.fullName ?? b.code}
              subtitle={`${b.code} · ${bookingStateLabel(b.state)}`}
              meta={`${dayLabel(b.checkIn)} → ${dayLabel(b.checkOut)}`}
              last={i === rows.length - 1}
              accessibilityLabel={`${b.code}, ${b.guest?.fullName ?? ""}, ${whole(b.due)} due`}
              onPress={() => router.push(`/bookings/${b.id}` as never)}
              right={
                <Text step="body" weight="bold" tone={b.due > 0 ? "danger" : "ok"} tabular>
                  {b.due > 0 ? whole(b.due) : "Paid"}
                </Text>
              }
            />
          ))
        )}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  figures: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
});
