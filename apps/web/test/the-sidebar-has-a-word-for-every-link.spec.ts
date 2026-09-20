/**
 * The sidebar has a word for every link (2026-09-21).
 *
 * Production's sidebar read **`nav.housekeeping`** — the raw key, in the
 * menu, between Rooms & Rates and Activities, for a day. Seen in a
 * screenshot; every text check had passed, including one of mine that
 * asked whether the body contained "Housekeeping" and was satisfied by
 * the page's own heading.
 *
 * The cause was a second dictionary. `i18n.tsx` says the dictionaries
 * moved to `@rh/app-core` because they are "the piece most certain to
 * have drifted if left in two places" — and the sidebar had kept a
 * private `EN_NAV`/`BN_NAV` of its own, fourteen entries copied from the
 * fifteen in the shared one. A new destination went into the shared
 * dictionary, the phone showed "Housekeeping", and the desk showed the
 * key.
 *
 * `?? n.labelKey` is what made it survive: a missing word rendered as
 * something rather than crashing, so nothing failed and nobody looked.
 *
 * Two rules, because either alone would have let this through: the
 * sidebar must read the shared dictionary, and the shared dictionary
 * must answer for every destination in both languages.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CONSOLE_NAV } from "@rh/shared";
import { DICTS } from "@rh/app-core";

const layout = fs.readFileSync(
  path.resolve(process.cwd(), "src/app/(app)/layout.tsx"),
  "utf8",
);

/**
 * The code, without the comments explaining the fault — a line saying
 * why `?? n.labelKey` was wrong is not a line doing it.
 */
const code = layout.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const keys = CONSOLE_NAV.map((d) => d.labelKey).filter((k): k is string => !!k);

describe("every destination has a word in both languages", () => {
  it("has destinations that are translated at all", () => {
    expect(keys.length).toBeGreaterThan(10);
  });

  it("answers in English", () => {
    const missing = keys.filter((k) => !(k in DICTS.en));
    expect(missing).toEqual([]);
  });

  it("answers in Bangla", () => {
    const missing = keys.filter((k) => !(k in DICTS.bn));
    expect(missing).toEqual([]);
  });

  /**
   * There was a third case here — "the Bangla word is not just the
   * English one copied across" — and the compiler refused it: the two
   * dictionaries are literal-typed and TypeScript proved the value sets
   * do not overlap, so the comparison can never be true. Deleted rather
   * than cast into silence. A test the type system has already won is
   * not a test, and the cast would have been the only thing keeping it
   * compiling.
   */
});

describe("the sidebar reads the shared dictionary", () => {
  it("keeps no nav dictionary of its own", () => {
    expect(code).not.toMatch(/const (EN|BN)_NAV\s*:/);
  });

  /**
   * The fallback is what hid it. A key with no word is a defect, and a
   * defect that renders is a defect nobody reports.
   */
  it("does not quietly print the key when a word is missing", () => {
    expect(code).not.toMatch(/\?\?\s*n\.labelKey/);
  });
});
