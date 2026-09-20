/**
 * A screen is called what the menu called it (2026-09-21).
 *
 * Found by walking the More list on a phone and opening each row. Four
 * of them changed their name on the way:
 *
 *   Bulk Email  → "Bulk email"
 *   Day Sheet   → "Day sheet"
 *   Import CSV  → "Import"
 *   My Profile  → "Your account"
 *
 * None of these is a bug in the ordinary sense — every screen loaded and
 * did its job — and that is exactly why they survived. A reader who taps
 * "Import CSV" and arrives at "Import" has to spend a beat deciding
 * whether they are where they meant to be, and a reader who taps "My
 * Profile" and arrives at "Your account" has to decide whether the
 * platform has two ideas of a person.
 *
 * The menu wins, always. `CONSOLE_NAV` is in `@rh/shared` because both
 * clients must offer the same destinations by the same names; a header
 * that disagrees with it has quietly forked the vocabulary in the one
 * place a shared list was supposed to prevent it.
 *
 * Only destinations are checked. A screen reached from inside another —
 * `settings/rates`, `reports/pl`, a booking, a guest — is not in the
 * menu and names itself, and a screen whose title is the record it is
 * showing ("BK-00009", a guest's name) is doing the right thing.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { CONSOLE_NAV, type NavDestination } from "@rh/shared";
import { DICTS } from "@rh/app-core";

const APP = join(__dirname, "..", "app");
const en: Record<string, string> = DICTS.en;

const labelOf = (d: NavDestination) =>
  d.labelKey ? (en[d.labelKey] ?? d.labelKey) : (d.label ?? d.href);

function screens(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) screens(full, found);
    else if (entry.name.endsWith(".tsx") && !entry.name.startsWith("_")) found.push(full);
  }
  return found;
}

/**
 * The URL a file answers on.
 *
 * `(name)` segments are expo-router groups and contribute nothing — which
 * is the whole reason the desk screens could be moved under `(desk)`
 * without changing a single href.
 */
function routeOf(file: string): string {
  const parts = relative(APP, file).split(sep);
  const last = parts.pop()!.replace(/\.tsx$/, "");
  const kept = [...parts, last === "index" ? "" : last].filter(
    (p) => p !== "" && !(p.startsWith("(") && p.endsWith(")")),
  );
  return `/${kept.join("/")}`;
}

/** The title the screen gives its own header, where it sets a fixed one. */
function headerOf(source: string): string | null {
  const m = /<Stack\.Screen\s+options=\{\{\s*title:\s*"([^"]*)"\s*\}\}/.exec(source);
  return m ? m[1] : null;
}

const named = screens(APP)
  .map((file) => ({ route: routeOf(file), title: headerOf(readFileSync(file, "utf8")) }))
  .filter((s): s is { route: string; title: string } => s.title !== null);

const menu = new Map(CONSOLE_NAV.map((d) => [d.href, labelOf(d)]));

describe("a screen is called what the menu called it", () => {
  it("found the screens and the menu", () => {
    expect(named.length).toBeGreaterThan(20);
    expect(menu.size).toBeGreaterThan(25);
  });

  it("gives every destination the menu's own words for it", () => {
    const renamed = named
      .filter((s) => menu.has(s.route) && menu.get(s.route) !== s.title)
      .map((s) => `${s.route}: menu "${menu.get(s.route)}", screen "${s.title}"`);
    expect(renamed).toEqual([]);
  });

  /**
   * The rule reaches the menu's destinations and stops there, so that
   * naming a sub-screen for what it does stays allowed.
   */
  it("says nothing about a screen the menu does not offer", () => {
    const inner = named.filter((s) => !menu.has(s.route)).map((s) => s.route);
    expect(inner).toContain("/settings/rates");
    expect(inner).toContain("/reports/pl");
  });

  it("reads a route the way expo-router does, through its groups", () => {
    expect(routeOf(join(APP, "(tabs)", "(desk)", "mailbox.tsx"))).toBe("/mailbox");
    expect(routeOf(join(APP, "(tabs)", "(desk)", "fb", "index.tsx"))).toBe("/fb");
    expect(routeOf(join(APP, "(tabs)", "rooms.tsx"))).toBe("/rooms");
  });
});
