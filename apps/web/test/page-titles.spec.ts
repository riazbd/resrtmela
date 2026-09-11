/**
 * Every screen names itself in the browser tab.
 *
 * The tab used to read the same thing on all of them. A person with the day
 * sheet, a booking and the platform console open in three tabs could not tell
 * them apart, and neither could their history. The pages are client
 * components, so the title lives in a small server layout beside each one —
 * which is easy to forget when adding a screen, hence this test.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const APP = path.resolve(process.cwd(), "src/app");

function pages(dir: string, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) pages(full, found);
    else if (entry.name === "page.tsx") found.push(path.dirname(full));
  }
  return found;
}

/** The title a route declares: its own metadata, or its layout's. */
function titleOf(routeDir: string): string | null {
  for (const file of ["layout.tsx", "page.tsx"]) {
    const full = path.join(routeDir, file);
    if (!fs.existsSync(full)) continue;
    const src = fs.readFileSync(full, "utf8");
    if (/title:/.test(src)) return src;
  }
  return null;
}

describe("the browser tab", () => {
  const routes = pages(APP);

  it("finds the screens at all", () => {
    expect(routes.length).toBeGreaterThan(20);
  });

  it("names every screen", () => {
    const silent = routes
      .filter((r) => !titleOf(r))
      .map((r) => path.relative(APP, r).replace(/\\/g, "/"));

    expect(silent).toEqual([]);
  });

  it("lets the brand be the suffix, not the whole name", () => {
    const root = fs.readFileSync(path.join(APP, "layout.tsx"), "utf8");

    // a template, so a screen says "Bookings" and the tab says "Bookings · <brand>"
    expect(root).toMatch(/template:\s*`%s · \$\{brand\.name\}`/);
    // and not one fixed string stamped on every screen (the comment above it
    // quotes the old title, so this looks for a title being assigned one)
    expect(root).not.toMatch(/title:\s*`[^`]*Admin/);
  });
});
