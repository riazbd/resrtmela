/**
 * The edges a browser cannot see.
 *
 * `react-native-safe-area-context` measures the DOM on web. A browser tab
 * has no notch, no status bar and no gesture bar, so every inset comes
 * back zero and the lens draws a phone with none of a phone's edges. On
 * 2026-09-20 the first real build put the status bar on top of the day
 * sheet's first row, and nothing in 268 tests or a single browser check
 * could have shown it — in a browser the row genuinely was clear.
 *
 * So the lens is allowed to say what the edges are, and `SafeAreaProvider`
 * is given them as its starting metrics. **Nothing reads this on a
 * device.** There the measurement is the truth, `__RM_INSETS__` is never
 * set, and this returns `undefined`, which is exactly what the provider
 * wants when it is to measure for itself.
 *
 * It refuses nonsense rather than correcting it. A lens that quietly turns
 * a bad number into a plausible one draws a phone nobody sells, and
 * somebody then spends an afternoon on a layout bug that is not there.
 */
import type { Metrics } from "react-native-safe-area-context";
import { Dimensions } from "react-native";

export type Insets = { top: number; bottom: number; left: number; right: number };

/**
 * The two shapes worth pretending to be.
 *
 * `notch` is the hard case — a tall status area and a gesture bar — and
 * `android` is what most of this platform's users hold. A layout that
 * survives both survives the ones in between.
 */
export const PRETEND: Record<"notch" | "android", Insets> = {
  notch: { top: 47, bottom: 34, left: 0, right: 0 },
  android: { top: 24, bottom: 0, left: 0, right: 0 },
};

/** Taller than this is not an edge, it is a mistake. */
const MOST = 120;

function sane(given: Partial<Insets>): Insets | null {
  const filled: Insets = {
    top: given.top ?? 0,
    bottom: given.bottom ?? 0,
    left: given.left ?? 0,
    right: given.right ?? 0,
  };
  for (const side of ["top", "bottom", "left", "right"] as const) {
    const n = filled[side];
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > MOST) return null;
  }
  return filled;
}

export function lensMetrics(): Metrics | undefined {
  const said = (globalThis as { __RM_INSETS__?: unknown }).__RM_INSETS__;
  if (said === undefined || said === null) return undefined;

  let insets: Insets | null = null;
  if (typeof said === "string") {
    insets = said in PRETEND ? PRETEND[said as keyof typeof PRETEND] : null;
  } else if (typeof said === "object") {
    insets = sane(said as Partial<Insets>);
  }
  if (!insets) return undefined;

  // the frame is the window, so a screen laid out against it is laid out
  // against the same thing the browser is drawing
  const { width, height } = Dimensions.get("window");
  return { frame: { x: 0, y: 0, width, height }, insets };
}
