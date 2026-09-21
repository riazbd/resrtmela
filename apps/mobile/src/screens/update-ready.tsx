/**
 * "A new version is ready — restart" (2026-09-21).
 *
 * Without this, an over-the-air update is downloaded in the background
 * and applied on the *next* launch, and nothing anywhere says so. The
 * honest description of that is what I ended up writing to the owner:
 * install it, open it, close it, open it again. Their answer was that
 * this is a problem, and it is — for the first install, and for every
 * update after it, because a person who never closes the app runs last
 * week's code all week and is never told.
 *
 * The two obvious fixes are both worse:
 *
 *   - **Block the launch** until the new bundle arrives
 *     (`fallbackToCacheTimeout`). That puts the network in front of the
 *     splash screen, and this app is used on hill-resort connections
 *     where that means seconds of nothing before the day sheet.
 *   - **Reload the moment it lands.** The app would restart itself
 *     under somebody halfway through taking a booking. Losing a
 *     half-typed guest to a version bump is a worse bug than the one
 *     being fixed.
 *
 * So: download quietly, and when it is *ready*, say so once and let
 * the person pick the moment. One tap, at a time nobody is mid-
 * sentence.
 *
 * Nothing is imported from `expo-updates` at module scope — the same
 * rule `push.ts` follows. In Expo Go and in development the module is
 * there but disabled, and this renders nothing.
 */
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "../design/text";
import { TOUCH_TARGET, color, radius, space } from "../design/tokens";

/** Loaded lazily so a host without the native module never touches it. */
function updates(): typeof import("expo-updates") | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("expo-updates") as typeof import("expo-updates");
  } catch {
    return null;
  }
}

export function UpdateReady() {
  const [ready, setReady] = useState(false);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    const Updates = updates();
    // `isEnabled` is false in Expo Go and in development: there is no
    // bundle to swap and nothing to announce
    if (!Updates?.isEnabled) return;

    let alive = true;

    /*
     * Two ways to learn about it, because they cover different
     * moments. The event fires when a download finishes while the app
     * is open; the first check covers a download that finished during
     * a previous run and is already sitting on disk — which is
     * precisely the case after installing a build older than the
     * latest bundle.
     */
    const sub = Updates.addUpdatesStateChangeListener?.((event) => {
      if (alive && event.context.isUpdatePending) setReady(true);
    });

    void (async () => {
      try {
        const state = await Updates.checkForUpdateAsync();
        if (!alive || !state.isAvailable) return;
        await Updates.fetchUpdateAsync();
        if (alive) setReady(true);
      } catch {
        // no signal, or the server is quiet. There is nothing useful to
        // say about an update that could not be fetched, and a banner
        // about it would be noise on a screen somebody is working in.
      }
    })();

    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);

  if (!ready) return null;

  return (
    <View style={styles.bar}>
      <Text step="small" weight="medium" tone="onBrand" style={styles.said} numberOfLines={2}>
        A new version is ready.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Restart now to use the new version"
        disabled={restarting}
        onPress={() => {
          setRestarting(true);
          const Updates = updates();
          void Updates?.reloadAsync();
        }}
        style={({ pressed }) => [styles.action, pressed ? styles.pressed : null]}
      >
        <Text step="small" weight="bold" tone="ok" numberOfLines={1}>
          {restarting ? "Restarting…" : "Restart"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    backgroundColor: color.brand[600],
  },
  said: { flex: 1 },
  action: {
    minHeight: TOUCH_TARGET - space.lg,
    justifyContent: "center",
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surface,
  },
  pressed: { opacity: 0.7 },
});
