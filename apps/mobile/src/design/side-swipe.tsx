/**
 * Dragging sideways to move a week, beside the arrows that already do.
 *
 * The arrows work and stay. But a calendar is the one screen people read by
 * moving through it — *"slide kore future day, date gula dekhte para ar beshi
 * flexible"* — and reaching for a small chevron at the top of the screen to
 * see next week is a tap where a thumb already wants to push.
 *
 * **`PanResponder`, not a gesture library.** `react-native-gesture-handler` is
 * a dependency of the app and used by nothing in it; introducing it here would
 * mean a `GestureHandlerRootView` at the root and its own jest setup, for a
 * horizontal drag that React Native answers on its own. This is pure
 * JavaScript, so it runs under the test suite as it runs on a phone.
 *
 * **It has to live inside a vertical scroll and not fight it.** The room grid
 * scrolls down through forty rooms and sideways through the weeks, and a
 * responder that claimed every drag would make the list unscrollable. So it
 * only asks for the gesture once a drag is clearly sideways, and the rule for
 * that is `swipeVerdict` below — a function rather than three numbers buried in
 * a callback, because it is the part worth testing and the part somebody will
 * want to tune.
 */
import { useMemo, type ReactNode } from "react";
import { PanResponder, View, type StyleProp, type ViewStyle } from "react-native";

/** Far enough to mean it: about a fifth of a phone's width. */
const FAR = 64;
/** A flick — short but fast — counts too, at points per millisecond. */
const QUICK = 0.3;
const QUICK_ENOUGH = 24;
/** Below this, it is a tap with a shaky thumb. */
const NOT_A_TAP = 12;
/** Sideways has to beat downwards by this much before the list lets go. */
const SIDEWAYS = 1.6;

/**
 * Whether a drag that has just ended moved the view, and which way.
 *
 * `back` is a drag to the right — the content follows the thumb, so pulling
 * right brings the earlier days on. Null means it was not enough of a
 * movement, and nothing happens, which is how somebody changes their mind
 * halfway through.
 */
export function swipeVerdict(dx: number, vx: number): "back" | "forward" | null {
  const far = Math.abs(dx) >= FAR;
  const flick = Math.abs(vx) >= QUICK && Math.abs(dx) >= QUICK_ENOUGH;
  if (!far && !flick) return null;
  return dx < 0 ? "forward" : "back";
}

/** Whether a drag in progress is sideways enough to take from the list. */
export function isSideways(dx: number, dy: number): boolean {
  return Math.abs(dx) > NOT_A_TAP && Math.abs(dx) > Math.abs(dy) * SIDEWAYS;
}

export function SideSwipe({
  onBack,
  onForward,
  children,
  style,
}: {
  onBack: () => void;
  onForward: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const pan = useMemo(
    () =>
      PanResponder.create({
        // never on touch-down: a night in the grid is a button, and claiming
        // the gesture before anybody has moved would make every one of them
        // dead
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_e, g) => isSideways(g.dx, g.dy),
        /**
         * On release rather than as the finger crosses the line. Nothing moves
         * under the thumb here — the week is redrawn, not dragged — so firing
         * mid-drag would jump the screen while somebody is still deciding, and
         * there would be no way to take it back.
         */
        onPanResponderRelease: (_e, g) => {
          const went = swipeVerdict(g.dx, g.vx);
          if (went === "forward") onForward();
          else if (went === "back") onBack();
        },
        // a parent that wants it — the scroll view — may have it
        onPanResponderTerminationRequest: () => true,
      }),
    [onBack, onForward],
  );

  return (
    <View style={style} {...pan.panHandlers}>
      {children}
    </View>
  );
}
