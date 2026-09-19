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
 */
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useT } from "@rh/app-core";
import type { NavDestination } from "@rh/shared";
import { useAuth } from "../../src/api/session";
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
  const { me, role, can, features } = useAuth();
  const t = useT();

  const mine = me ? tabsFor({ role, can, features }) : [];
  const onTheBar = new Map(mine.map((d, i) => [d.href, { d, i }]));

  /** What a person reads: the dictionary's word where there is one. */
  const titleOf = (d: NavDestination) =>
    d.labelKey ? t(d.labelKey as never) : (d.label ?? d.href);

  return (
    <Tabs
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
              title: on ? titleOf(on.d) : "",
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
    </Tabs>
  );
}
