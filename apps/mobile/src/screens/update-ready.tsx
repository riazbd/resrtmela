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
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AppState, Pressable, StyleSheet, View } from "react-native";
import { useOutbox } from "@rh/app-core";
import { Text } from "../design/text";
import { TOUCH_TARGET, color, radius, space } from "../design/tokens";

/**
 * Whether the bar is up, readable from outside it.
 *
 * `TopEdge` colours the status-bar strip, and the strip has to match what is
 * under it — a grey band above a green bar reads as a mistake. A module-level
 * store rather than a context provider because there is exactly one of these
 * in the app and the alternative is a provider whose only job is to carry one
 * boolean past two components.
 */
let waiting = false;
const watching = new Set<() => void>();

function announce(now: boolean) {
  if (waiting === now) return;
  waiting = now;
  for (const tell of watching) tell();
}

/**
 * The same answer outside React, for a listener that cannot call a hook.
 *
 * Not named `use…`: it is a plain read of the store, and calling it from an
 * `AppState` handler is the whole point.
 */
export function anUpdateIsWaiting(): boolean {
  return waiting;
}

export function useUpdateReady(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      watching.add(onChange);
      return () => watching.delete(onChange);
    },
    () => waiting,
    () => waiting,
  );
}

/** Loaded lazily so a host without the native module never touches it. */
function updates(): typeof import("expo-updates") | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("expo-updates") as typeof import("expo-updates");
  } catch {
    return null;
  }
}

/**
 * How long away counts as "nobody is in the middle of anything".
 *
 * A booking takes a minute or two to type. Fifteen minutes in the background
 * is a phone that went in a pocket, and coming back to the current version is
 * what somebody would want if they were asked.
 */
const AWAY_LONG_ENOUGH = 15 * 60 * 1000;

export function UpdateReady() {
  const ready = useUpdateReady();
  const [restarting, setRestarting] = useState(false);
  const { pending } = useOutbox();
  const left = useRef<number | null>(null);

  /**
   * A downloaded update that nobody applies is a feature nobody receives.
   *
   * The bar has been the only way in, and it asks for a decision while
   * somebody is looking at a screen they opened for another reason — so it
   * gets ignored, for weeks. The owner's phone sat a month behind on a build
   * that had the charts in it, with the bar up in every screenshot.
   *
   * Expo applies a pending update on the next *cold* start, and Android rarely
   * gives it one: the process stays resident and the app is resumed, not
   * launched. So this does what a cold start would have done, when it is
   * plainly safe — the app has been away a quarter of an hour and there is
   * nothing queued to send. The bar stays for everyone who wants to decide
   * sooner.
   */
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active") {
        left.current = Date.now();
        return;
      }
      const away = left.current == null ? 0 : Date.now() - left.current;
      left.current = null;
      if (!pending.length && away >= AWAY_LONG_ENOUGH && anUpdateIsWaiting()) {
        const Updates = updates();
        void Updates?.reloadAsync();
      }
    });
    return () => sub.remove();
    // `pending` by identity: a queued write appearing must be seen by the
    // listener, and the array is replaced whenever the queue changes
  }, [pending]);

  useEffect(() => {
    const Updates = updates();
    /*
     * `isEnabled` is false in Expo Go and in development: there is no bundle
     * to swap and nothing to announce. Said out loud rather than returned
     * quietly, because the answer now lives in a module-level store that
     * outlives this component — and a store that only ever learns "yes" would
     * keep colouring the status-bar strip green after the bar itself had
     * gone.
     */
    if (!Updates?.isEnabled) {
      announce(false);
      return;
    }

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
      if (alive && event.context.isUpdatePending) announce(true);
    });

    void (async () => {
      try {
        const state = await Updates.checkForUpdateAsync();
        /*
         * `isAvailable: false` is not "nothing is waiting" — it means the
         * server has nothing newer than what is already downloaded, which is
         * exactly the case when a bundle from a previous run is pending. The
         * listener above is what knows that, so this says nothing either way.
         */
        if (!alive || !state.isAvailable) return;
        await Updates.fetchUpdateAsync();
        if (alive) announce(true);
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
