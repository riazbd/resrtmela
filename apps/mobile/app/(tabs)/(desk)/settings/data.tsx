/**
 * Your data is yours — every register, one tap each, on the phone.
 *
 * The console's "Your data" tab. Each dataset is a CSV that opens in Excel
 * with Bangla intact; the archive is everything in one file. Exports keep
 * working whatever happens to the subscription.
 */
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuth } from "../../../../src/api/session";
import { shareDownload } from "../../../../src/api/download";
import { WhichResort } from "../../../../src/screens/which-resort";
import { refusal } from "../../../../src/screens/payroll-month";
import { Button } from "../../../../src/design/button";
import { Card } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { color, elevation, radius, space } from "../../../../src/design/tokens";

type Icon = keyof typeof MaterialCommunityIcons.glyphMap;

/** The console's eight datasets, in its order and words. */
const DATASETS: { key: string; label: string; hint: string; icon: Icon }[] = [
  { key: "bookings", label: "Bookings", hint: "every stay with its full bill", icon: "calendar-check" },
  { key: "guests", label: "Guests", hint: "names, phones, NID/passport", icon: "account-group" },
  { key: "payments", label: "Payments", hint: "who paid what, when and how", icon: "cash-multiple" },
  { key: "expenses", label: "Expenses", hint: "resort and restaurant", icon: "receipt" },
  { key: "restaurant", label: "Restaurant bills", hint: "with line items", icon: "silverware-fork-knife" },
  { key: "rooms", label: "Rooms & types", hint: "inventory and rates", icon: "bed" },
  { key: "staff", label: "Staff & agents", hint: "roles and commissions", icon: "badge-account" },
  { key: "activities", label: "Activities", hint: "the bookable catalogue", icon: "kayaking" },
];

export default function DataScreen() {
  const { activeResort } = useAuth();
  const rid = activeResort?.id;
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);

  const header = <Stack.Screen options={{ title: "Your data" }} />;
  if (rid === undefined) return (<>{header}<WhichResort /></>);

  async function grab(key: string, label: string) {
    setBusy(key);
    setSaid(null);
    try {
      if (key === "archive") await shareDownload(`/resorts/${rid}/export/archive`, `${activeResort?.name ?? "resort"}-everything.json`);
      else await shareDownload(`/resorts/${rid}/export/${key}.csv`, `${key}.csv`);
      setSaid({ ok: true, text: `${label} ready` });
    } catch (e) {
      setSaid({ ok: false, text: refusal(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {header}
      <ScrollView contentContainerStyle={styles.page}>
        <Card title="Your data is yours">
          <Text step="small" tone="muted">
            Every file opens in Excel with Bangla intact, and the exports keep working whatever happens to the subscription.
          </Text>
        </Card>
        {said ? (
          <Text step="small" weight="medium" tone={said.ok ? "ok" : "danger"}>
            {said.text}
          </Text>
        ) : null}
        <View style={styles.grid}>
          {DATASETS.map((d, i) => (
            <Pressable
              key={d.key}
              accessibilityRole="button"
              accessibilityLabel={`Download ${d.label}`}
              disabled={busy !== null}
              onPress={() => void grab(d.key, d.label)}
              style={({ pressed }) => [styles.tile, pressed ? styles.pressed : null, busy !== null && busy !== d.key ? styles.dim : null]}
            >
              <View style={[styles.icon, { backgroundColor: color.chart.series[i % color.chart.series.length] }]}>
                <MaterialCommunityIcons name={d.icon} size={22} color={color.onBrand} />
              </View>
              <Text step="body" weight="bold" tone="title" numberOfLines={1}>
                {d.label}
              </Text>
              <Text step="caption" tone="muted" numberOfLines={2}>
                {busy === d.key ? "Preparing…" : d.hint}
              </Text>
            </Pressable>
          ))}
        </View>
        <Card title="Everything, in one file">
          <Text step="small" tone="muted">
            All eight datasets as a single archive.
          </Text>
          <Button label={busy === "archive" ? "Preparing…" : "Get the archive"} loading={busy === "archive"} disabled={busy !== null && busy !== "archive"} onPress={() => void grab("archive", "The archive")} />
        </Card>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  tile: {
    flexGrow: 1,
    flexBasis: "45%",
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.xs,
    borderWidth: 1,
    borderColor: color.ink[100],
    ...elevation.raised,
  },
  pressed: { opacity: 0.7 },
  dim: { opacity: 0.5 },
  icon: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginBottom: space.xs },
});
