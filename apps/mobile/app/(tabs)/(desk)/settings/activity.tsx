/**
 * Who did what: the resort's activity log, searchable, on the phone.
 *
 * The console's "Activity log" tab. Each line is a person, an act and what it
 * was done to; a manager can take a line out, as on the desk.
 */
import { useEffect, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import type { ActivityRow } from "@rh/shared";
import { client, useAuth } from "../../../../src/api/session";
import { WhichResort } from "../../../../src/screens/which-resort";
import { ask, refusal } from "../../../../src/screens/payroll-month";
import { Button } from "../../../../src/design/button";
import { Input } from "../../../../src/design/input";
import { Empty, Loading } from "../../../../src/design/states";
import { Text } from "../../../../src/design/text";
import { color, elevation, radius, space } from "../../../../src/design/tokens";

/** "booking.create" → a colour by what kind of thing was touched. */
function tint(action: string): string {
  const s = color.chart.series;
  const head = action.split(".")[0] ?? "";
  const known: Record<string, string> = {
    booking: s[0]!,
    payment: s[1]!,
    payroll: s[3]!,
    expense: s[5]!,
    room: s[4]!,
    agent: s[2]!,
  };
  return known[head] ?? color.ink[400];
}

export default function ActivityLogScreen() {
  const { activeResort } = useAuth();
  const rid = activeResort?.id;
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [q, setQ] = useState("");
  const [refused, setRefused] = useState<string | null>(null);

  useEffect(() => {
    if (rid === undefined) return;
    const t = setTimeout(() => {
      client.resort
        .activity(rid, { take: 150, q: q.trim() || undefined })
        .then(setRows)
        .catch((e) => {
          setRows([]);
          setRefused(refusal(e));
        });
    }, 300);
    return () => clearTimeout(t);
  }, [rid, q]);

  const header = <Stack.Screen options={{ title: "Activity log" }} />;
  if (rid === undefined) return (<>{header}<WhichResort /></>);

  function remove(id: string) {
    ask("Delete this entry?", "It comes out of the log for good.", "Delete", () => {
      client.resort
        .deleteActivity(id)
        .then(() => setRows((r) => r?.filter((x) => x.id !== id) ?? null))
        .catch((e) => setRefused(refusal(e)));
    });
  }

  return (
    <>
      {header}
      <FlatList
        contentContainerStyle={styles.page}
        data={rows ?? []}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={
          <View style={styles.head}>
            <Input value={q} onChangeText={setQ} placeholder="Search by name, phone, email or action…" />
            {refused ? (
              <Text step="small" tone="danger">
                {refused}
              </Text>
            ) : null}
            {!rows ? <Loading what="the log" /> : null}
          </View>
        }
        ListEmptyComponent={rows ? <Empty message={q ? "No matches" : "No activity recorded yet"} /> : null}
        renderItem={({ item: r }) => (
          <View style={styles.item}>
            <View style={[styles.dot, { backgroundColor: tint(r.action) }]} />
            <View style={styles.flex}>
              <Text step="body" weight="medium" tone="title" numberOfLines={1}>
                {r.actor ? r.actor.name : "System"}
              </Text>
              <Text step="small" tone="body" numberOfLines={1}>
                {`${r.action.replace(/\./g, " · ")}${r.entityId ? ` — ${r.entity} #${r.entityId}` : ""}`}
              </Text>
              <Text step="caption" tone="muted" numberOfLines={1}>
                {`${new Date(r.createdAt).toLocaleString("en-GB")}${r.actor ? ` · ${r.actor.role.replace(/_/g, " ").toLowerCase()}` : ""}`}
              </Text>
            </View>
            <Button label="Delete" kind="subtle" block={false} accessibilityLabel={`Delete ${r.action}`} onPress={() => remove(r.id)} />
          </View>
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.sm },
  head: { gap: space.sm, marginBottom: space.sm },
  flex: { flex: 1, gap: 2 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: color.ink[100],
    ...elevation.raised,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
