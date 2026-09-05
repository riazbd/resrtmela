import { ScrollView, Text, View } from "react-native";
import { useAuth } from "../lib/auth";
import { Button, Card, S, COLORS } from "../components/Ui";

export default function ProfileScreen() {
  const { me, activeResort, logout, isAgent } = useAuth();
  const entry = me?.resorts.find((r) => r.resort.id === activeResort?.id);

  return (
    <ScrollView contentContainerStyle={{ padding: 14 }}>
      <Card>
        <View style={[S.row, { gap: 12 }]}>
          <View
            style={{
              width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.brand,
              alignItems: "center", justifyContent: "center",
            }}
          >
            <Text style={{ color: "#fff", fontSize: 18, fontWeight: "800" }}>
              {me?.name.slice(0, 1)}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={S.h2}>{me?.name}</Text>
            <Text style={S.tiny}>{me?.phone}</Text>
            <Text style={S.tiny}>{me?.role.replace(/_/g, " ")} · {activeResort?.name}</Text>
          </View>
        </View>
      </Card>

      {isAgent && (
        <Card>
          <Text style={S.h2}>Commission</Text>
          <Text style={[S.tiny, { marginTop: 4 }]}>
            Rate: {entry?.commissionRate ?? 0}% — reports land in Phase 6
          </Text>
        </Card>
      )}

      <Card>
        <Text style={S.h2}>{isAgent ? "Resort" : "Account"}</Text>
        <Text style={[S.tiny, { marginTop: 4 }]}>
          {isAgent
            ? "Staffed via Resort Mela Admin Console"
            : "Book rooms across resorts — pay at the resort on arrival."}
        </Text>
      </Card>

      <Button title="Sign out" variant="danger" onPress={logout} />
    </ScrollView>
  );
}
