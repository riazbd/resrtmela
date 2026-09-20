/**
 * A tab screen does not name itself. The bar names it.
 *
 * `barLabel` shortens the handful of destinations whose console label
 * will not fit on a phone's bar, and `(tabs)/_layout.tsx` applies it. A
 * screen that also sets `<Stack.Screen options={{ title }} />` overrides
 * that from underneath, and the bar goes back to showing an ellipsis.
 *
 * Found by looking at a screenshot, twice. The owner caught **"Rooms &
 * Ra…"** first; `barLabel` fixed it; then phase 3's own new screens
 * arrived carrying their own titles and the bar read **"Find a room"**
 * and **"Quotes & in…"**. The same defect, reintroduced by the person
 * who had just fixed it — which is the definition of something that
 * needs a rule rather than a memory.
 *
 * Screens below `(tabs)` that are *not* tabs — the `(desk)` group —
 * keep their titles: those are headers on a pushed screen, and a header
 * has the whole width of the phone.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const TABS = join(__dirname, "..", "app", "(tabs)");

/** Every file that is a tab: in the group itself, or under `agent/`. */
function tabScreens(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        // a nested group holds pushed screens, which are headers not tabs
        if (!/^\(.*\)$/.test(entry.name)) walk(full);
        continue;
      }
      if (entry.name.endsWith(".tsx") && entry.name !== "_layout.tsx") out.push(full);
    }
  };
  walk(TABS);
  return out;
}

const show = (f: string) => relative(join(__dirname, ".."), f).split("\\").join("/");

describe("what a tab is called", () => {
  it("has tabs to check", () => {
    expect(tabScreens().length).toBeGreaterThan(5);
  });

  it("is decided by the bar, not by the screen", () => {
    const naming = tabScreens()
      .filter((f) => /Stack\.Screen\s+options=\{\{\s*title:/.test(readFileSync(f, "utf8")))
      .map(show);
    expect(naming).toEqual([]);
  });

  it("is passed through barLabel where the bar is drawn", () => {
    const layout = readFileSync(join(TABS, "_layout.tsx"), "utf8");
    expect(layout).toMatch(/barLabel\(/);
  });
});
