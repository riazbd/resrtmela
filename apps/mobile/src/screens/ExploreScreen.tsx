import { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { guestResorts, type GuestResort, bdt } from "../lib/api";
import { Button, Card, COLORS, Empty, S, Spinner } from "../components/Ui";

export default function ExploreScreen({ onOpen }: { onOpen: (resortId: number) => void }) {
  const [resorts, setResorts] = useState<GuestResort[] | null>(null);

  const load = useCallback(async () => {
    setResorts(null);
    setResorts(await guestResorts());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (resorts === null) return <Spinner />;

  return (
    <ScrollView contentContainerStyle={{ padding: 14 }}>
      <Text style={[S.h1, { marginBottom: 2 }]}>Explore resorts</Text>
      <Text style={[S.sub, { marginBottom: 12 }]}>Book rooms, pay at the resort</Text>

      {resorts.length === 0 && <Empty msg="No resorts available yet" />}

      {resorts.map((r) => {
        const priceFrom = (r.roomTypes ?? [])
          .map((t) => t.priceFrom)
          .filter((p): p is number => p !== null);
        const min = priceFrom.length ? Math.min(...priceFrom) : null;
        return (
          <View key={r.id} style={[S.card, { padding: 0, overflow: "hidden" }]}>
            <View
              style={{
                height: 86, backgroundColor: COLORS.brand,
                justifyContent: "flex-end", padding: 12,
              }}
            >
              <Text style={{ color: "#fff", fontSize: 17, fontWeight: "800" }}>{r.name}</Text>
              {r.location ? <Text style={{ color: "#dcfce7", fontSize: 11 }}>{r.location}</Text> : null}
            </View>
            <View style={[S.row, S.between, { padding: 12 }]}>
              <View style={{ flex: 1 }}>
                <Text style={S.tiny}>
                  {(r.roomTypes ?? []).length} room type(s){r.roomCount ? ` · ${r.roomCount} rooms` : ""}
                </Text>
                {min !== null && (
                  <Text style={{ fontSize: 13, fontWeight: "700", color: COLORS.brand, marginTop: 2 }}>
                    From {bdt(min)} / night
                  </Text>
                )}
              </View>
              <Button title="View" onPress={() => onOpen(r.id)} />
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}
