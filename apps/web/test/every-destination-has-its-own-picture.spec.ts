/**
 * Every destination has a picture of its own — the desk's copy
 * (2026-09-21).
 *
 * The phone had this fault and it was fixed there the same day: the
 * fallback icon was a compass, `/activities` uses a compass, and when
 * Housekeeping arrived without one the menu drew the two screens one
 * under the other behind the same picture. Nothing could tell the
 * borrowed one from the chosen one — not the code, and not the eye.
 *
 * The console had the identical fault from the identical cause, and
 * fixing one client while leaving the other is how a defect gets fixed
 * twice and found three times. Both are guarded now.
 *
 * The fallback keeps its job — a screen added to `CONSOLE_NAV` must be
 * visible before anybody has drawn for it — but it is a question mark,
 * which can be mistaken for nothing else. A hole you can see beats a
 * plausible icon that hides.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CONSOLE_NAV } from "@rh/shared";

const layout = fs.readFileSync(
  path.resolve(process.cwd(), "src/app/(app)/layout.tsx"),
  "utf8",
);

/**
 * The `ICONS` table, read as text.
 *
 * The lucide components cannot be compared here — importing them pulls
 * React into a plain source check — so the href keys are what is
 * checked, which is exactly the thing that was missing.
 */
const drawn = new Set(
  [...layout.matchAll(/"(\/[a-z/-]*)":\s*[A-Z]\w*,/g)].map((m) => m[1]),
);

describe("every destination has its own picture", () => {
  it("found the icon table", () => {
    expect(drawn.size).toBeGreaterThan(20);
  });

  it("chose one, rather than falling back, for every screen in the menu", () => {
    const borrowed = CONSOLE_NAV.filter((d) => !drawn.has(d.href)).map((d) => d.href);
    expect(borrowed).toEqual([]);
  });

  /**
   * The fallback must not be an icon a real screen also uses, or a
   * destination that forgot to choose looks exactly like one that did.
   */
  it("falls back to something no real screen uses", () => {
    const fallback = /icon: ICONS\[entry\.href\] \?\? (\w+),/.exec(layout)?.[1];
    expect(fallback).toBeTruthy();
    const used = [...layout.matchAll(/"\/[a-z/-]*":\s*(\w+),/g)].map((m) => m[1]);
    expect(used).not.toContain(fallback);
  });
});
