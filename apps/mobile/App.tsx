import { useState } from "react";
import { Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "./src/lib/auth";
import { COLORS, S, Spinner, Button } from "./src/components/Ui";
import LoginScreen from "./src/screens/LoginScreen";
import TodayScreen from "./src/screens/TodayScreen";
import BookingsScreen from "./src/screens/BookingsScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import ExploreScreen from "./src/screens/ExploreScreen";
import ResortDetailScreen from "./src/screens/ResortDetailScreen";
import TripsScreen from "./src/screens/TripsScreen";

type Tab = "today" | "bookings" | "profile" | "explore" | "trips";

function Header({ title, subtitle, onTitlePress }: { title: string; subtitle?: string; onTitlePress?: () => void }) {
  return (
    <View style={{ backgroundColor: COLORS.brandDark, paddingTop: 48, paddingBottom: 10, paddingHorizontal: 14 }}>
      <Text style={{ color: "#fff", fontSize: 16, fontWeight: "800" }} onPress={onTitlePress}>{title}</Text>
      {subtitle ? <Text style={{ color: "#bbf7d0", fontSize: 11, marginTop: 2 }}>{subtitle}</Text> : null}
    </View>
  );
}

function GuestShell() {
  const { me } = useAuth();
  const [tab, setTab] = useState<Tab>("explore");
  const [openResort, setOpenResort] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const tabs: { key: Tab; label: string }[] = [
    { key: "explore", label: "Explore" },
    { key: "trips", label: "My trips" },
    { key: "profile", label: "Profile" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <Header
        title={openResort !== null ? "Resort details" : "Resort Mela"}
        subtitle={openResort !== null ? undefined : `Hi ${me?.name ?? ""} — find your next stay`}
      />
      <View style={{ flex: 1 }}>
        {tab === "explore" &&
          (openResort !== null ? (
            <ResortDetailScreen resortId={openResort} onBack={() => setOpenResort(null)} />
          ) : (
            <ExploreScreen onOpen={(id) => setOpenResort(id)} />
          ))}
        {tab === "trips" && <TripsScreen refreshKey={refreshKey} />}
        {tab === "profile" && <ProfileScreen />}
      </View>
      <View
        style={{
          flexDirection: "row", borderTopWidth: 1, borderTopColor: COLORS.border,
          backgroundColor: "#fff", paddingBottom: 20, paddingTop: 8,
        }}
      >
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <View key={t.key} style={{ flex: 1 }}>
              <Text
                onPress={() => {
                  if (active && t.key === "trips") setRefreshKey((k) => k + 1);
                  setTab(t.key);
                }}
                style={{
                  textAlign: "center", fontSize: 12,
                  fontWeight: active ? "700" : "500",
                  color: active ? COLORS.brand : COLORS.sub,
                }}
              >
                {t.label}
              </Text>
            </View>
          );
        })}
      </View>
      <StatusBar style="light" />
    </View>
  );
}

function StaffShell() {
  const { me, activeResort, isStaff, isAgent, setActiveResort } = useAuth();
  const [tab, setTab] = useState<Tab>("today");
  const [refreshKey, setRefreshKey] = useState(0);

  const tabs: { key: Tab; label: string }[] = [
    ...(isStaff || isAgent ? ([{ key: "today" as Tab, label: "Today" }]) : []),
    { key: "bookings", label: isAgent ? "My bookings" : "Bookings" },
    { key: "profile", label: "Profile" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <Header
        title="Resort Mela"
        subtitle={activeResort ? `${activeResort.name}${me && me.resorts.length > 1 ? " (tap to switch)" : ""}` : undefined}
        onTitlePress={
          activeResort && me && me.resorts.length > 1
            ? () => {
                const others = me.resorts.map((r) => r.resort);
                const idx = others.findIndex((r) => r.id === activeResort.id);
                setActiveResort(others[(idx + 1) % others.length]!);
              }
            : undefined
        }
      />
      <View style={{ flex: 1 }}>
        {tab === "today" && <TodayScreen refreshKey={refreshKey} />}
        {tab === "bookings" && <BookingsScreen refreshKey={refreshKey} />}
        {tab === "profile" && <ProfileScreen />}
      </View>
      <View
        style={{
          flexDirection: "row", borderTopWidth: 1, borderTopColor: COLORS.border,
          backgroundColor: "#fff", paddingBottom: 20, paddingTop: 8,
        }}
      >
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <View key={t.key} style={{ flex: 1 }}>
              <Text
                onPress={() => {
                  if (active && t.key !== "profile") setRefreshKey((k) => k + 1);
                  setTab(t.key);
                }}
                style={{
                  textAlign: "center", fontSize: 12,
                  fontWeight: active ? "700" : "500",
                  color: active ? COLORS.brand : COLORS.sub,
                }}
              >
                {t.label}
              </Text>
            </View>
          );
        })}
      </View>
      <StatusBar style="light" />
    </View>
  );
}

function Shell() {
  const { me, booting } = useAuth();

  if (booting) return <Spinner />;
  if (!me) return <LoginScreen />;
  if (me.role === "GUEST") return <GuestShell />;
  return <StaffShell />;
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
