/**
 * Everything every screen sits inside.
 *
 * expo-router, so the app's routes are the console's paths — `/bookings`,
 * `/agent/calendar`, `/settings/team`. Parity is then visible in the file
 * tree rather than asserted, and a push notification that opens one booking
 * needs no second routing table.
 */
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider } from "../src/api/session";
import { color } from "../src/design/tokens";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      {/* dark marks on a light ground: the console's register is a white
          screen, and a light status bar over it is invisible */}
      <StatusBar style="dark" />
      <SessionProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: color.screen },
            animation: "fade",
          }}
        />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
