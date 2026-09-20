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
import { color, text } from "../src/design/tokens";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      {/* dark marks on a light ground: the console's register is a white
          screen, and a light status bar over it is invisible */}
      <StatusBar style="dark" />
      <SessionProvider>
        {/*
          A header by default, and off for the screens that are their own
          world. Everything else is pushed from somewhere — the More
          list, a row on the day sheet — and a pushed screen with no header
          is a screen with no way back. The tab group draws its own bar, the
          front door and the login screen are not pushed from anywhere, and
          `+not-found` has nothing to go back to that would help.
        */}
        <Stack
          screenOptions={{
            headerShown: true,
            headerStyle: { backgroundColor: color.surface },
            headerTintColor: color.brand[600],
            headerTitleStyle: { color: color.title, fontWeight: "600", fontSize: text.strong.size },
            // a rule, not a shadow: the register below it is drawn in rules
            headerShadowVisible: false,
            contentStyle: { backgroundColor: color.screen },
            animation: "fade",
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" options={{ headerShown: false }} />
          {/* a stack of its own, three steps deep, with its own headers */}
          <Stack.Screen name="new-booking" options={{ headerShown: false }} />
        </Stack>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
