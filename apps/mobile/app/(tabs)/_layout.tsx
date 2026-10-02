/**
 * The tab bar: four screens this person opens all day, plus More.
 *
 * Which four is `tabsFor`, and whether a person may have one at all is
 * `navVisible` over `CONSOLE_NAV` — both shared with the console, so a tab
 * the phone offers is a screen the server will serve.
 *
 * expo-router wants a `Tabs.Screen` for every file in this folder whether or
 * not it is on the bar, so each one is declared and the ones that are not
 * this person's get `href: null`. That hides the tab and keeps the route
 * reachable, which is what a deep link from a notification needs.
 *
 * These four are the only screens in the app with no header, and a header
 * is what holds a screen clear of the status bar. The first real build put
 * the clock through the word "Occupancy" and the wifi bars through
 * "Arrivals" — invisible in a browser, which has no status bar, and
 * invisible to every test, which has no screen. So the group carries the
 * top inset itself.
 */
import { Pressable, View } from "react-native";
import { Text } from "../../src/design/text";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useT } from "@rh/app-core";
import type { NavDestination } from "@rh/shared";
import { useAuth } from "../../src/api/session";
import { barLabel } from "../../src/nav/bar-label";
import { MORE_ICON, iconFor } from "../../src/nav/icons";
import { tabsFor } from "../../src/nav/tabs";
import { TOUCH_TARGET, color, text } from "../../src/design/tokens";

/** Every screen file in this folder, and the route each one answers on. */
const FILES = [
  { name: "dashboard", href: "/dashboard" },
  { name: "calendar", href: "/calendar" },
  { name: "bookings", href: "/bookings" },
  { name: "rooms", href: "/rooms" },
  { name: "agent/discover", href: "/agent/discover" },
  { name: "agent/search", href: "/agent/search" },
  { name: "agent/calendar", href: "/agent/calendar" },
  { name: "agent/sales", href: "/agent/sales" },
] as const;

export default function TabLayout() {
  const { me, role, can, features, isImpersonating, exitImpersonation } = useAuth();
  const t = useT();

  const mine = me ? tabsFor({ role, can, features }) : [];
  const onTheBar = new Map(mine.map((d, i) => [d.href, { d, i }]));

  /** What a person reads: the dictionary's word where there is one. */
  const titleOf = (d: NavDestination) =>
    d.labelKey ? t(d.labelKey as never) : (d.label ?? d.href);

  return (
    /**
     * No top padding here any more: `TopEdge` at the root spends the top inset
     * once for the whole app and hands `top: 0` down, so this used to add a
     * second one — a band of nothing under the update bar, which sits above
     * this navigator. The View stays for the background; the edge is not this
     * group's to own, because the sign-up form is not in this group and was
     * drawing through the clock.
     */
    <View style={{ flex: 1, backgroundColor: color.screen }}>
    {/* the platform owner looking through somebody's account says so, and
        offers the way back — the console's amber bar, on the phone */}
    {isImpersonating ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Viewing as ${me?.name ?? "someone"}. Back to the platform`}
        onPress={exitImpersonation}
        style={{ backgroundColor: color.warn.bg, borderBottomWidth: 1, borderBottomColor: color.warn.line, paddingVertical: 8, paddingHorizontal: 16, flexDirection: "row", justifyContent: "space-between" }}
      >
        <Text step="small" weight="medium" tone="warn">{`Viewing as ${me?.name ?? ""}`}</Text>
        <Text step="small" weight="bold" tone="warn">Back to the platform</Text>
      </Pressable>
    ) : null}
    <Tabs
      /**
       * Back goes back, not home.
       *
       * React Navigation's tab router defaults to `backBehavior: "firstRoute"`
       * — press the phone's Back from anywhere and you are returned to the
       * *first* tab, whatever tab or screen you were actually on. For resort
       * staff that lands on the dashboard, which looks enough like home that
       * nobody questioned it. For an agency the first tab is "Discover
       * resorts", a screen for finding new resorts to sell: so every time an
       * agent opened anything from More — their team, their wallet, a tour —
       * and pressed Back, they were put on a screen they had not asked for
       * and had to find More again. The owner reported it as every function
       * showing the same thing on the way out.
       *
       * `history` returns to the last screen actually visited, dropping
       * repeats so that backing out of a tab visited five times is one press
       * and not five.
       */
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.brand[600],
        tabBarInactiveTintColor: color.muted,
        tabBarLabelStyle: { fontSize: text.caption.size, fontWeight: "600" },
        tabBarStyle: {
          backgroundColor: color.surface,
          borderTopColor: color.line,
          // the bar is something a thumb hits, so it owes the same floor
          // every other target does
          minHeight: TOUCH_TARGET + 12,
        },
      }}
    >
      {FILES.map((file) => {
        const on = onTheBar.get(file.href);
        return (
          <Tabs.Screen
            key={file.name}
            name={file.name}
            options={{
              // `null` hides the tab without unregistering the route, so a
              // notification can still deep-link into it
              href: on ? (file.href as never) : null,
              title: on ? barLabel(on.d.href, titleOf(on.d)) : "",
              tabBarIcon: ({ color: tint, size }) => (
                <MaterialCommunityIcons name={iconFor(file.href)} size={size} color={tint} />
              ),
            }}
          />
        );
      })}

      {/*
        More is always last and always present. Even somebody with a single
        permission has an account to change a password on and a session to
        end, and a bar with one tab and no way out is a trap.
      */}
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ color: tint, size }) => (
            <MaterialCommunityIcons name={MORE_ICON} size={size} color={tint} />
          ),
        }}
      />

      {/*
        Every destination the More list offers, inside the navigator and
        off the bar. `href: null` is the same trick the loop above uses
        for a tab this person may not see: the route stays registered, so
        a deep link still lands, and no button is drawn for it.

        Before this they were siblings of the whole navigator, and the bar
        disappeared the moment anybody opened one — thirteen screens with
        a back arrow and no way anywhere else.
      */}
      <Tabs.Screen name="(desk)" options={{ href: null }} />
    </Tabs>
    </View>
  );
}
