/**
 * The subscription calendar — the console's Calendar tab on the phone: a
 * month of days, each coloured by what falls due on it and how many accounts
 * renew. Tap a day for its figures.
 */
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { keys, useApi } from "@rh/app-core";
import { addMonths, daysInMonth, formatMoney, monthName, todayIn, type SubscriptionCalendarCell } from "@rh/shared";
import { client } from "../../../../src/api/session";
import { Button } from "../../../../src/design/button";
import { Kpi } from "../../../../src/design/charts";
import { useMoneyFormat } from "../../../../src/design/money";
import { Loading } from "../../../../src/design/states";
import { Card } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { color, radius, space } from "../../../../src/design/tokens";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export default function PlatformCalendar() {
  const fmt = useMoneyFormat();
  const money = (n: number) => formatMoney(n, { ...fmt, decimals: 0 });
  const [month, setMonth] = useState(() => todayIn("Asia/Dhaka").slice(0, 7));
  const [picked, setPicked] = useState<number | null>(null);
  const last = daysInMonth(month);
  const q = useApi<SubscriptionCalendarCell[]>(keys.platform("sub-calendar", month), () =>
    client.platform.subCalendar(`${month}-01`, `${month}-${String(last).padStart(2, "0")}`),
  );
  const cells = q.data ?? [];
  const byDay = new Map(cells.map((c) => [Number(c.date.slice(8)), c]));
  const lead = new Date(`${month}-01T12:00:00Z`).getUTCDay();
  const most = Math.max(1, ...cells.map((c) => c.dues));
  const chosen = picked ? byDay.get(picked) : undefined;

  return (
    <>
      <Stack.Screen options={{ title: "Calendar" }} />
      <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
        <View style={styles.row}>
          <Button label="‹" kind="ghost" block={false} accessibilityLabel="Previous month" onPress={() => { setPicked(null); setMonth(addMonths(month, -1)); }} />
          <Text step="strong" weight="bold" tone="title" style={styles.center}>
            {monthName(month)}
          </Text>
          <Button label="›" kind="ghost" block={false} accessibilityLabel="Next month" onPress={() => { setPicked(null); setMonth(addMonths(month, 1)); }} />
        </View>
        <View style={styles.figures}>
          <Kpi label="Falling due" value={money(cells.reduce((n, c) => n + c.dues, 0))} tint={color.chart.money.left.solid} />
          <Kpi label="Renewals" value={String(cells.reduce((n, c) => n + c.renewals, 0))} tint={color.chart.money.advance.solid} />
        </View>
        {!q.data ? (
          <Loading what="the month" />
        ) : (
          <Card>
            <View style={styles.grid}>
              {WEEKDAYS.map((w, i) => (
                <View key={`h${i}`} style={styles.cell}>
                  <Text step="caption" weight="bold" tone="muted">
                    {w}
                  </Text>
                </View>
              ))}
              {Array.from({ length: lead }, (_, i) => (
                <View key={`b${i}`} style={styles.cell} />
              ))}
              {Array.from({ length: last }, (_, i) => {
                const day = i + 1;
                const c = byDay.get(day);
                const heat = c && c.dues > 0 ? 0.25 + (0.75 * c.dues) / most : 0;
                return (
                  <Pressable
                    key={day}
                    accessibilityRole="button"
                    accessibilityLabel={`${day} ${monthName(month)}${c ? `, ${money(c.dues)} due, ${c.renewals} renewals` : ", nothing"}`}
                    onPress={() => setPicked(day)}
                    style={[styles.cell, styles.day, picked === day ? styles.on : null]}
                  >
                    {heat > 0 ? <View style={[styles.heat, { opacity: heat }]} /> : null}
                    <Text step="small" weight={c ? "bold" : "regular"} tone={c ? "title" : "muted"}>
                      {String(day)}
                    </Text>
                    {c && c.renewals > 0 ? <View style={styles.dot} /> : null}
                  </Pressable>
                );
              })}
            </View>
          </Card>
        )}
        {picked ? (
          <Card title={`${picked} ${monthName(month)}`}>
            {chosen ? (
              <Text step="body" tone="body">{`${money(chosen.dues)} due across ${chosen.dueCount} bill${chosen.dueCount === 1 ? "" : "s"} · ${chosen.renewals} renewal${chosen.renewals === 1 ? "" : "s"}`}</Text>
            ) : (
              <Text step="body" tone="muted">
                Nothing falls due.
              </Text>
            )}
          </Card>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  center: { flex: 1, textAlign: "center" },
  figures: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  day: { borderRadius: radius.sm, overflow: "hidden" },
  heat: { position: "absolute", top: 3, left: 3, right: 3, bottom: 3, borderRadius: radius.sm, backgroundColor: color.chart.money.left.solid },
  on: { borderWidth: 2, borderColor: color.ink[900] },
  dot: { position: "absolute", bottom: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: color.chart.money.advance.solid },
});
