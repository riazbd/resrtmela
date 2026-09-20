/**
 * A tab's name fits on the bar (2026-09-20).
 *
 * The owner opened the app and the last tab read **"Rooms & Ra…"**. The
 * label is the console's — `nav.rooms`, "Rooms & Rates" — and it is the
 * right label there, where a sidebar is two hundred points wide and full
 * of room. A phone's bar divides 393 points among five tabs, and the
 * caption font puts about ten characters in each.
 *
 * The same word cannot serve both, so the phone keeps the full label in
 * the More list, where there is width for it, and shortens the handful
 * that do not fit on the bar. `barLabel` is that list, and this spec is
 * the reason it stays honest: a destination added to `CONSOLE_NAV` with
 * a long label fails here rather than on somebody's screen.
 *
 * The ten is measured, not guessed — see the note on `BAR_LIMIT`.
 */
import { CONSOLE_NAV, type NavDestination } from "@rh/shared";
import { BAR_LIMIT, barLabel } from "../src/nav/bar-label";

/** The English dictionary, which is what the bar shows by default. */
import { DICTS } from "@rh/app-core";
const en: Record<string, string> = DICTS.en;

const labelOf = (d: NavDestination) =>
  d.labelKey ? (en[d.labelKey] ?? d.labelKey) : (d.label ?? d.href);

/**
 * Only the resort side reaches this bar today; the agent tabs arrive in
 * phase 3 and are checked all the same, because the failure is the same
 * shape and finding it now costs nothing.
 */
const destinations = CONSOLE_NAV.filter((d) => d.href !== "/platform");

describe("what a tab can be called", () => {
  it("has destinations to check", () => {
    expect(destinations.length).toBeGreaterThan(10);
  });

  it("gives every destination a name the bar can show whole", () => {
    const tooLong = destinations
      .map((d) => ({ href: d.href, on: barLabel(d.href, labelOf(d)) }))
      .filter(({ on }) => on.length > BAR_LIMIT)
      .map(({ href, on }) => `${href}: "${on}" (${on.length})`);
    expect(tooLong).toEqual([]);
  });

  it("shortens the one that started this", () => {
    expect(barLabel("/rooms", "Rooms & Rates")).toBe("Rooms");
  });

  it("leaves a label that already fits exactly as the console has it", () => {
    expect(barLabel("/bookings", "Bookings")).toBe("Bookings");
    expect(barLabel("/dashboard", "Dashboard")).toBe("Dashboard");
  });

  /**
   * The More list is not the bar. It has the full width of the screen and
   * shows the console's own words, so somebody moving between the two
   * recognises the same screen by the same name.
   */
  it("shortens only where it must, and says so by leaving the rest alone", () => {
    const changed = destinations.filter((d) => barLabel(d.href, labelOf(d)) !== labelOf(d));
    // a short list, and every entry on it is a label the bar cannot hold
    expect(changed.length).toBeLessThan(6);
    for (const d of changed) expect(labelOf(d).length).toBeGreaterThan(BAR_LIMIT);
  });
});
