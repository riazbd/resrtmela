/**
 * The strip under the clock, owned in one place.
 *
 * Android draws edge to edge, so the window starts at the very top of the
 * glass and anything laid out at y=0 sits under the status bar. Every screen
 * that is not inside a navigation header has to allow for that, and "every
 * screen has to remember" is the shape of a bug that keeps coming back: the
 * sign-up form put "PLAN · Starter" through the clock and "Change" through the
 * wifi icon, while the tab group — which did remember — was fine.
 *
 * Worse, the two fixes fought. The tab navigator padded itself by the inset,
 * and the update bar is rendered *above* the navigator, so when the bar was up
 * the tabs pushed their content down a second time and left a band of nothing
 * under it.
 *
 * So: **one component pads once, at the root, and tells everything below that
 * the top edge is already spent.** Overriding `SafeAreaInsetsContext` with
 * `top: 0` is what makes that safe — React Navigation's headers,
 * `SafeAreaView` and `useSafeAreaInsets` all read that context, so none of
 * them can add the same inset again. The other three edges pass through
 * untouched: the tab bar still clears the gesture bar at the bottom.
 *
 * A screen that genuinely wants to paint under the clock is not a thing this
 * product has. If it ever is, it asks for the real insets above this.
 */
import type { ReactNode } from "react";
import { View } from "react-native";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { color } from "./tokens";

/**
 * `tone` is the colour of the strip itself, and it matters because the update
 * bar is the first thing under it: a grey band above a green bar reads as a
 * gap somebody forgot rather than a bar somebody meant. The caller decides,
 * because the caller is the one that knows what it put at the top.
 */
export function TopEdge({
  children,
  tone = "screen",
}: {
  children: ReactNode;
  tone?: "screen" | "brand";
}) {
  const insets = useSafeAreaInsets();
  const above = tone === "brand" ? color.brand[600] : color.screen;
  return (
    <View testID="top-edge" style={{ flex: 1, paddingTop: insets.top, backgroundColor: above }}>
      {/*
        Spent, so nothing below may spend it again. `left`, `right` and
        `bottom` are handed on as measured.
      */}
      <SafeAreaInsetsContext.Provider value={{ ...insets, top: 0 }}>
        {children}
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}
