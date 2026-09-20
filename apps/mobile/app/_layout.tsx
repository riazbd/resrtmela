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
import { lensMetrics } from "../src/design/lens-insets";
import { color, text } from "../src/design/tokens";

export default function RootLayout() {
  return (
    /*
      `initialMetrics` is undefined on a phone, which is the provider's
      own default and means "measure for yourself". It is set only when
      the browser lens has been told to pretend it has edges — a browser
      tab measures none, so without this the lens drew the one phone that
      cannot exist, and the status bar over the day sheet's first row got
      all the way into a build.
    */
    <SafeAreaProvider initialMetrics={lensMetrics()}>
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
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" options={{ headerShown: false }} />
          {/*
            `new-booking` was declared here until 2026-09-21 and moved into
            `(tabs)/(desk)` so it keeps the bar. A `Stack.Screen` naming a
            route that is no longer a child of this stack is what produced
            `[Layout children]: No route named "new-booking"` on every
            screen — a warning about this file, shown over whatever the
             reader happened to be looking at.
          */}
          <Stack.Screen name="plans" options={{ headerShown: true, title: "What it costs" }} />
          <Stack.Screen name="signup" options={{ headerShown: false }} />
        </Stack>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
