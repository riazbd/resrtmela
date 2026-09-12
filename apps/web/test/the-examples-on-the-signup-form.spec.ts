/**
 * The example text in the signup form.
 *
 * Two things go wrong with placeholders and neither shows up in a screenshot.
 *
 * The first is that they drift apart. This form's examples were written at
 * different times, so it invited "Sundarban Group" as the company and then
 * suggested "sky-eco-group" as the web address — two unrelated businesses on
 * one screen, at the exact moment someone is deciding what to type. The URL
 * field auto-fills from the company name, so the two are not independent
 * choices at all: the address example has to be the slug of the name example,
 * or the form is demonstrating something it will not do.
 *
 * The second is that the examples came from the seeded demo world. "sky-eco-
 * group" and "Sea Breeze Travels" are live accounts in `seed/accounts.ts`, and
 * a placeholder is copied more often than it is read — the first person to do
 * it collides with a real slug and gets an error they cannot explain.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SIGNUP = path.resolve(process.cwd(), "src/app/signup");
const SEED = path.resolve(process.cwd(), "../../packages/db/prisma/seed/accounts.ts");

function placeholdersIn(file: string): string[] {
  const src = fs.readFileSync(file, "utf8");
  return [...src.matchAll(/placeholder="([^"]+)"/g)].map((m) => m[1]!);
}

/** Slugified the way the form itself does it, so the test cannot disagree. */
function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

const RESORT_FORM = path.join(SIGNUP, "page.tsx");
const AGENCY_FORM = path.join(SIGNUP, "agency", "page.tsx");

describe("the examples on the signup form", () => {
  it("never suggests a name that exists in the seeded world", () => {
    const seed = fs.readFileSync(SEED, "utf8");
    // the names and slugs the demo world actually creates
    const taken = [
      ...[...seed.matchAll(/name:\s*"([^"]+)"/g)].map((m) => m[1]!),
      ...[...seed.matchAll(/slug:\s*"([^"]+)"/g)].map((m) => m[1]!),
    ].map((s) => s.toLowerCase());

    for (const file of [RESORT_FORM, AGENCY_FORM]) {
      for (const ph of placeholdersIn(file)) {
        const bare = ph.replace(/^e\.g\.\s*/i, "").toLowerCase();
        expect(taken, `"${ph}" in ${path.basename(path.dirname(file))} is a seeded account`).not.toContain(bare);
      }
    }
  });

  it("suggests a web address that matches the company it suggests", () => {
    const src = fs.readFileSync(RESORT_FORM, "utf8");
    const company = src.match(/Company \/ group name[\s\S]{0,400}?placeholder="(?:e\.g\.\s*)?([^"]+)"/)?.[1];
    const url = src.match(/Workspace URL[\s\S]{0,600}?placeholder="([^"]+)"/)?.[1];
    expect(company, "could not find the company-name example").toBeTruthy();
    expect(url, "could not find the workspace-URL example").toBeTruthy();
    expect(url, `typing "${company}" produces "${slugify(company!)}", not "${url}"`).toBe(
      slugify(company!),
    );
  });

  it("marks every example as an example", () => {
    // a placeholder that reads like a filled-in value gets left alone; one that
    // states a rule ("min 8 characters") is not an example and does not need it
    const RULES = /^(min |max |\d|01X)/i;
    for (const file of [RESORT_FORM, AGENCY_FORM]) {
      for (const ph of placeholdersIn(file)) {
        if (RULES.test(ph) || ph.includes("@") || /^[a-z0-9-]+$/.test(ph)) continue;
        expect(ph, `"${ph}" reads as a value, not an example`).toMatch(/^e\.g\. /);
      }
    }
  });
});
