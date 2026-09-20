/**
 * A phone has edges. In a browser it does not, and that cost a build.
 *
 * `react-native-safe-area-context` measures the DOM on web, finds no
 * notch, no status bar and no gesture bar, and reports every inset as
 * zero. So the lens draws a phone with none of a phone's edges, and on
 * 2026-09-20 the first real build showed the status bar sitting on top of
 * the day sheet's first row — invisible to the whole test suite and to
 * every browser check, because in a browser the row really was clear.
 *
 * `lensMetrics` lets the lens say what the edges are. It reads nothing on
 * a device, where the measurement is the truth; it answers only when a
 * browser has been told to pretend, and it refuses to pretend badly —
 * negative or absurd insets would draw a phone nobody sells, and a lens
 * that lies in a new direction is worse than one that does not lie at all.
 */
import { lensMetrics, PRETEND } from "../src/design/lens-insets";

type Pretender = { __RM_INSETS__?: unknown };
const g = globalThis as Pretender;

afterEach(() => {
  delete g.__RM_INSETS__;
});

describe("the edges the lens pretends to have", () => {
  it("says nothing at all when nobody asked it to pretend", () => {
    expect(lensMetrics()).toBeUndefined();
  });

  it("gives a notched phone's edges when asked for one", () => {
    g.__RM_INSETS__ = "notch";
    const m = lensMetrics();
    expect(m?.insets).toEqual(PRETEND.notch);
    // the frame is the window, so a screen laid out against it is laid out
    // against the same thing the browser is drawing
    expect(m?.frame.width).toBeGreaterThan(0);
    expect(m?.frame.height).toBeGreaterThan(0);
  });

  it("gives a plain Android phone's edges, which are not a notch's", () => {
    g.__RM_INSETS__ = "android";
    expect(lensMetrics()?.insets).toEqual(PRETEND.android);
    expect(PRETEND.android.top).toBeLessThan(PRETEND.notch.top);
  });

  it("takes exact edges when the lens names them", () => {
    g.__RM_INSETS__ = { top: 30, bottom: 12, left: 0, right: 0 };
    expect(lensMetrics()?.insets).toEqual({ top: 30, bottom: 12, left: 0, right: 0 });
  });

  it("fills in the edges a caller left out rather than guessing", () => {
    g.__RM_INSETS__ = { top: 44 };
    expect(lensMetrics()?.insets).toEqual({ top: 44, bottom: 0, left: 0, right: 0 });
  });

  /**
   * A lens that draws an impossible phone sends somebody chasing a layout
   * bug that does not exist. Nonsense is refused outright, not clamped
   * into something plausible — being told "that is not a phone" is more
   * use than a silently corrected number.
   */
  it.each([
    ["a negative edge", { top: -10 }],
    ["an edge taller than a phone", { top: 400 }],
    ["a name nobody defined", "iphone-27"],
    ["nothing recognisable", 7],
  ])("refuses %s", (_what, value) => {
    g.__RM_INSETS__ = value;
    expect(lensMetrics()).toBeUndefined();
  });
});
