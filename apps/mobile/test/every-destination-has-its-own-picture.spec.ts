/**
 * Every destination has a picture of its own (2026-09-21).
 *
 * The More list showed **Housekeeping** and **Activities** one under the
 * other with the same compass beside both. Neither was wrong, exactly:
 * `iconFor` answers `compass-outline` for an href it does not know, and
 * the fallback is there on purpose so a screen added to `CONSOLE_NAV`
 * appears in the list before anybody has chosen a picture for it.
 *
 * What the fallback cannot do is stay. Two adjacent rows carrying the
 * same icon is worse than two rows carrying none — the icons stop being
 * a way to find a row and become decoration, and the reader learns to
 * ignore the whole column.
 *
 * So the fallback keeps its job, and this keeps the fallback honest: it
 * may catch a destination on the day it is added, and it fails here
 * before that day ends.
 *
 * Icons deliberately shared: an agency's screen and the resort's screen
 * for the same thing — a calendar, a guest list, expenses — are the same
 * idea seen from two sides, and nobody sees both lists at once, because
 * a person is resort staff or they are an agent.
 */
import { CONSOLE_NAV } from "@rh/shared";
import { iconFor } from "../src/nav/icons";

/** What `iconFor` answers when it has never heard of the screen. */
const FALLBACK = iconFor("/nowhere-at-all");

describe("every destination has its own picture", () => {
  it("has the menu to read", () => {
    expect(CONSOLE_NAV.length).toBeGreaterThan(25);
  });

  it("chose one, rather than falling back, for every screen in the menu", () => {
    const borrowed = CONSOLE_NAV.filter((d) => iconFor(d.href) === FALLBACK).map((d) => d.href);
    expect(borrowed).toEqual([]);
  });

  it("keeps the fallback for a screen nobody has drawn yet", () => {
    expect(iconFor("/a-screen-from-next-month")).toBe(FALLBACK);
  });

  /**
   * The pairs that share on purpose are named, so that a third screen
   * quietly taking one of these icons is a change somebody made rather
   * than one that happened.
   */
  it("shares an icon only between an agency's screen and the resort's own", () => {
    const byIcon = new Map<string, string[]>();
    for (const d of CONSOLE_NAV) {
      const icon = String(iconFor(d.href));
      byIcon.set(icon, [...(byIcon.get(icon) ?? []), d.href]);
    }
    const shared = [...byIcon.values()]
      .filter((hrefs) => hrefs.length > 1)
      .map((hrefs) => hrefs.slice().sort().join(" + "));
    for (const pair of shared) {
      const sides = pair.split(" + ");
      // one of the two is the agency's copy of the other
      expect(sides.some((h) => h.startsWith("/agent/"))).toBe(true);
      expect(sides.some((h) => !h.startsWith("/agent/"))).toBe(true);
    }
  });
});
