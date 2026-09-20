/**
 * Every door the app offers opens on something (2026-09-20).
 *
 * The More list is not written by hand. It is `CONSOLE_NAV` — the console's
 * own twenty-nine destinations — filtered by what this person may see, so a
 * tab the phone offers is a screen the server will serve. That is the right
 * design and it has one hole: the list is the *console's* screens, and the
 * app has fewer of them. Eighteen of the twenty-nine had no route on the day
 * phase 1 shipped, and nothing in the repository said so.
 *
 * "Not built yet" is an honest landing and not a crash — `+not-found` names
 * the path and offers a way back. What is not honest is the app having no
 * record of which doors those are, because then a destination added to
 * `CONSOLE_NAV` for the console arrives silently in the phone's More list
 * and is found by whoever taps it.
 *
 * So: every destination is either routable, or named below as work not yet
 * done. The list shrinks as the phases land. A destination on neither side
 * of it fails here.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { CONSOLE_NAV } from "@rh/shared";

const APP = join(__dirname, "..", "app");

/**
 * What is still to come, and when.
 *
 * Each line is a promise with a phase on it. Deleting a line is how a
 * screen is declared done, and the phase's plan is the other half of the
 * same statement.
 */
const NOT_YET: Record<string, string> = {
  // phase 2 — the rest of the resort
  "/fb": "phase 2",
  "/payroll": "phase 2",
  "/activities": "phase 2",
  "/import": "phase 2",
  "/profile": "phase 2",
  "/settings": "phase 2",
  "/mailbox": "phase 2",
  // phase 3 — the agent's own panel
  "/agent/tours": "phase 3",
  "/agent/guests": "phase 3",
  "/agent/expenses": "phase 3",
  "/agent/payroll": "phase 3",
  "/agent/wallet": "phase 3",
  "/agent/team": "phase 3",
  "/agent/website": "phase 3",
  "/agent/api": "phase 3",
};

/**
 * Every path expo-router will serve, read off the file tree the way the
 * router reads it: a `(group)` contributes no segment, `index` is its
 * folder, and `_layout` and `+not-found` are not destinations.
 */
function routes(): Set<string> {
  const found = new Set<string>();
  (function walk(dir: string, base: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        // a group folder is organisation, not a segment of the URL
        const next = /^\(.*\)$/.test(entry.name) ? base : `${base}/${entry.name}`;
        walk(full, next);
        continue;
      }
      if (!entry.name.endsWith(".tsx")) continue;
      if (entry.name.startsWith("_") || entry.name.startsWith("+")) continue;
      const name = entry.name.replace(/\.tsx$/, "");
      found.add(name === "index" ? base || "/" : `${base}/${name}`);
    }
  })(APP, "");
  return found;
}

describe("every door the app offers", () => {
  it("finds the app's routes, so a passing run is not an empty one", () => {
    // well under the 56 the app ends with, and well over what phase 0 had
    expect(routes().size).toBeGreaterThan(15);
  });

  it("either opens, or is written down as not yet built", () => {
    const have = routes();
    const orphans = CONSOLE_NAV.filter((d) => !have.has(d.href) && !NOT_YET[d.href]).map(
      (d) => `${d.href} (${d.label ?? d.labelKey})`,
    );
    expect(orphans).toEqual([]);
  });

  /**
   * The other direction, which is the one that rots quietly. A promise
   * left in the list after the screen lands makes the list a lie, and the
   * next reader trusts it about a screen that is still missing.
   */
  it("keeps no promise it has already kept", () => {
    const have = routes();
    const stale = Object.keys(NOT_YET).filter((href) => have.has(href));
    expect(stale).toEqual([]);
  });

  /** A promise about a destination nobody offers is dead weight. */
  it("promises nothing the nav does not offer", () => {
    const offered = new Set(CONSOLE_NAV.map((d) => d.href));
    expect(Object.keys(NOT_YET).filter((href) => !offered.has(href))).toEqual([]);
  });
});
