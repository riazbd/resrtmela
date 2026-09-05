import { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { api, bdt, dmy, type BookingRow, type TodayFeed } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Badge, Button, Card, Empty, S, Spinner, COLORS } from "../components/Ui";

export default function TodayScreen({ refreshKey }: { refreshKey: number }) {
  const { activeResort, isStaff } = useAuth();
  const [feed, setFeed] = useState<TodayFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!activeResort) return;
    setLoading(true);
    try {
      setFeed(await api<TodayFeed>(`/resorts/${activeResort.id}/today`));
    } finally {
      setLoading(false);
    }
  }, [activeResort]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function transition(b: BookingRow, to: string, label: string) {
    setBusyId(b.id);
    try {
      await api(`/bookings/${b.id}/transition`, { method: "POST", body: { to } });
      await load();
    } catch (e) {
      Alert.alert("Failed", (e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function collect(b: BookingRow) {
    Alert.prompt?.("Collect payment", `Due ${bdt(b.due)} — amount:`, async (text) => {
      const amount = Number(text);
      if (!amount || amount <= 0) return;
      try {
        await api(`/bookings/${b.id}/payments`, { method: "POST", body: { amount, method: "CASH" } });
        await load();
      } catch (e) {
        Alert.alert("Failed", (e as Error).message);
      }
    });
  }

  if (loading) return <Spinner />;
  if (!feed) return <Empty msg="Could not load today" />;

  return (
    <ScrollView contentContainerStyle={{ padding: 14 }}>
      <View style={[S.row, { gap: 8, marginBottom: 12 }]}>
        <View style={[S.card, { flex: 1, alignItems: "center", marginBottom: 0 }]}>
          <Text style={[S.tiny, { color: COLORS.sub }]}>OCCUPANCY</Text>
          <Text style={{ fontSize: 22, fontWeight: "800", color: COLORS.brandDark }}>{feed.occupancyPct}%</Text>
        </View>
        <View style={[S.card, { flex: 1, alignItems: "center", marginBottom: 0 }]}>
          <Text style={[S.tiny, { color: COLORS.sub }]}>DUES</Text>
          <Text style={{ fontSize: 18, fontWeight: "800", color: COLORS.red }}>{bdt(feed.duesTotal)}</Text>
          <Text style={S.tiny}>{feed.duesCount} booking(s)</Text>
        </View>
      </View>

      <Text style={[S.h2, { marginBottom: 8 }]}>Arrivals ({feed.arrivals.length})</Text>
      {feed.arrivals.length === 0 && <Empty msg="No arrivals today" />}
      {feed.arrivals.map((b) => (
        <View key={b.id} style={S.card}>
          <View style={[S.row, S.between]}>
            <View style={{ flex: 1 }}>
              <Text style={S.h2}>{b.guest?.fullName ?? "-"}</Text>
              <Text style={S.tiny}>{b.code} · {b.rooms.join(", ")} · due {bdt(b.due)}</Text>
            </View>
            <Badge value={b.state} />
          </View>
          {isStaff && b.state === "CONFIRMED" && (
            <View style={[S.row, { gap: 8, marginTop: 10 }]}>
              <Button title="Check in" onPress={() => transition(b, "CHECKED_IN", "checked in")}
                loading={busyId === b.id} style={{ flex: 1 }} />
              {b.due > 0 && (
                <Button title="Collect" variant="ghost" onPress={() => collect(b)} style={{ flex: 1 }} />
              )}
            </View>
          )}
        </View>
      ))}

      <Text style={[S.h2, { marginTop: 8, marginBottom: 8 }]}>Departures ({feed.departures.length})</Text>
      {feed.departures.length === 0 && <Empty msg="No departures today" />}
      {feed.departures.map((b) => (
        <View key={b.id} style={S.card}>
          <View style={[S.row, S.between]}>
            <View style={{ flex: 1 }}>
              <Text style={S.h2}>{b.guest?.fullName ?? "-"}</Text>
              <Text style={S.tiny}>{b.code} · {dmy(b.checkIn)} → {dmy(b.checkOut)} · due {bdt(b.due)}</Text>
            </View>
            <Badge value={b.state} />
          </View>
          {isStaff && b.state === "CHECKED_IN" && (
            <View style={[S.row, { gap: 8, marginTop: 10 }]}>
              <Button title="Check out" onPress={() => transition(b, "CHECKED_OUT", "checked out")}
                loading={busyId === b.id} style={{ flex: 1 }} />
              {b.due > 0 && (
                <Button title="Collect" variant="ghost" onPress={() => collect(b)} style={{ flex: 1 }} />
              )}
            </View>
          )}
        </View>
      ))}
    </ScrollView>
  );
}
