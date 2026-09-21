/**
 * A page nobody links to is a page nobody has (2026-09-21).
 *
 * `/app` is the download page. The app is not on Play and not on the
 * App Store, so that page is the only way anybody gets Resort Mela
 * onto a phone — and it shipped to production with **nothing linking
 * to it**. It rendered, it was correct, it had the right version and a
 * working button, and it was reachable only by typing the address.
 * The owner asked where the download link was, which is the question
 * that finds this class of fault and the only thing that was going to.
 *
 * Every check before that had passed. A route test asks "does it
 * answer"; this asks the question after it — "can anybody get there".
 *
 * Deliberately narrow. This is not a link checker for the whole site:
 * it pins the handful of pages whose whole purpose is to be arrived
 * at, where being unreachable is the same as being absent.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "../src");

/**
 * Pages that exist to be arrived at, and where somebody has to be able
 * to arrive from.
 */
const MUST_BE_REACHABLE = [
  {
    href: "/app",
    what: "the download page — the app's only door, with no store behind it",
    // the marketing site, for somebody who has not signed in; and the
    // console, so a manager can send a colleague to it
    from: ["app/(public)/home.tsx", "app/(app)/layout.tsx"],
  },
];

function everyFile(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return everyFile(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

/** A link to `href`, however it is written: `href="/app"` or a nav tuple. */
function linksTo(source: string, href: string): boolean {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  return new RegExp(`["'\`]${href}["'\`]`).test(code);
}

describe("a page that exists to be arrived at", () => {
  for (const page of MUST_BE_REACHABLE) {
    it(`has the page itself: ${page.href}`, () => {
      const routes = everyFile(SRC).filter((f) => f.replace(/\\/g, "/").includes("/app/page.tsx"));
      expect(routes.length, `no page.tsx renders ${page.href}`).toBeGreaterThan(0);
    });

    for (const from of page.from) {
      it(`is linked from ${from} — ${page.what}`, () => {
        const source = readFileSync(join(SRC, from), "utf8");
        expect(
          linksTo(source, page.href),
          `${from} does not link to ${page.href}. A page with no way in is a page nobody has.`,
        ).toBe(true);
      });
    }
  }

  /**
   * The check has to be able to fail, or it is decoration. A link that
   * exists only inside a comment explaining the link does not count.
   */
  it("does not mistake a comment for a link", () => {
    expect(linksTo('{/* one day we will link to "/app" */}', "/app")).toBe(false);
    expect(linksTo('/* see "/app" */ const x = 1;', "/app")).toBe(false);
    expect(linksTo('<Link href="/app">Get the app</Link>', "/app")).toBe(true);
  });
});
