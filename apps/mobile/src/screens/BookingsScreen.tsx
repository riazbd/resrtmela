import { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { api, bdt, dmy, type BookingRow } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Badge, Empty, S, Spinner } from "../components/Ui";

export default function BookingsScreen({ refreshKey }: { refreshKey: number }) {
  const { activeResort, isAgent } = useAuth();
  const [rows, setRows] = useState<BookingRow[] | null>(null);

  const load = useCallback(async () => {
    if (!activeResort) return;
    setRows(null);
    const r = await api<{ rows: BookingRow[]; total: number }>(
      `/bookings?resortId=${activeResort.id}&take=100`,
    );
    setRows(r.rows);
  }, [activeResort]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (rows === null) return <Spinner />;

  const title = isAgent ? "My bookings" : "All bookings";
  return (
    <ScrollView contentContainerStyle={{ padding: 14 }}>
      <Text style={[S.h2, { marginBottom: 8 }]}>{title} ({rows.length})</Text>
      {rows.length === 0 && <Empty msg="Nothing here yet" />}
      {rows.map((b) => (
        <View key={b.id} style={S.card}>
          <View style={[S.row, S.between]}>
            <View style={{ flex: 1 }}>
              <Text style={S.h2}>{b.guest?.fullName ?? "-"}</Text>
              <Text style={S.tiny}>
                {b.code} · {dmy(b.checkIn)} → {dmy(b.checkOut)} · {b.rooms.join(", ")}
              </Text>
              <Text style={S.tiny}>rent {bdt(b.rent)} · paid {bdt(b.paid)} · due {bdt(b.due)}</Text>
            </View>
            <View style={{ gap: 4, alignItems: "flex-end" }}>
              <Badge value={b.state} />
              <Badge value={b.paymentState} />
            </View>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
