/**
 * When a sideways drag moves the calendar, and when it leaves it alone.
 *
 * The rule is a function rather than three numbers inside a `PanResponder`
 * callback, because this is the part that decides whether the screen feels
 * right and the part nobody can check on a phone they do not have. The
 * responder itself is four lines of plumbing around it.
 *
 * Two things have to be true at once: a real drag moves the week, and a list
 * of forty rooms still scrolls down. The second is what `isSideways` protects
 * — it is the only thing standing between "swipe to next week" and "the room
 * list will not scroll".
 */
import { isSideways, swipeVerdict } from "../src/design/side-swipe";

describe("a drag that ends", () => {
  it("moves forward when it went left, and back when it went right", () => {
    // the content follows the thumb: pulling right brings the days behind on
    expect(swipeVerdict(-120, 0)).toBe("forward");
    expect(swipeVerdict(120, 0)).toBe("back");
  });

  it("ignores a drag too short to have been meant", () => {
    expect(swipeVerdict(-30, 0)).toBeNull();
    expect(swipeVerdict(30, 0)).toBeNull();
    expect(swipeVerdict(0, 0)).toBeNull();
  });

  /**
   * A flick is short and fast, and it is how most people actually turn a page
   * — a slow deliberate 64-point drag is the exception, not the rule.
   */
  it("takes a short flick if it was quick", () => {
    expect(swipeVerdict(-30, -0.9)).toBe("forward");
    expect(swipeVerdict(30, 0.9)).toBe("back");
  });

  it("does not take a quick twitch", () => {
    // fast but barely moved: a tap on a moving bus
    expect(swipeVerdict(-8, -0.9)).toBeNull();
  });

  /** Halfway and back again means the person changed their mind. */
  it("does nothing when the finger returns to where it started", () => {
    expect(swipeVerdict(2, 0.05)).toBeNull();
  });
});

describe("a drag in progress", () => {
  /**
   * The calendar is inside a vertical scroll of every room. If this said yes
   * to a downward drag, the list would stop scrolling — which is a worse bug
   * than the missing swipe it was added for.
   */
  it("leaves a downward drag to the list", () => {
    expect(isSideways(4, 80)).toBe(false);
    expect(isSideways(20, 80)).toBe(false);
    expect(isSideways(-20, -80)).toBe(false);
  });

  it("claims a drag that is plainly sideways", () => {
    expect(isSideways(60, 4)).toBe(true);
    expect(isSideways(-60, -10)).toBe(true);
  });

  it("leaves a tap alone, however shaky the thumb", () => {
    expect(isSideways(6, 2)).toBe(false);
    expect(isSideways(0, 0)).toBe(false);
  });

  /**
   * The diagonal case, which is where a threshold like this earns its keep: a
   * drag has to be clearly more sideways than down, not merely more.
   */
  it("wants sideways to win by a margin, not by a hair", () => {
    expect(isSideways(40, 35)).toBe(false);
    expect(isSideways(40, 20)).toBe(true);
  });
});
