/**
 * How long the free trial is, on the page that sells it.
 *
 * The homepage says it in four places. Two of them read it off the plan list
 * the API sends — `plans.every(p => p.trialDays === …)` — and two were the
 * characters `14 days`, typed into the page and into a CMS row.
 *
 * The trial length lives in `platform_plans.trialDays`, and Platform → Plans
 * lets the super admin change it without a deploy. The moment they do, the
 * same page says 30 days in two places and 14 in the other two, and the one a
 * visitor happens to read decides what they think they were promised.
 *
 * A number that can be derived from a setting should be derived. The owner can
 * still write their own words in the CMS; what must not happen is a *default*
 * that quietly contradicts the plan nobody edited.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Both halves: the server component that fetches, and the client one that
 * draws. The trial used to be typed into the drawing half, so checking only
 * the entry file would have missed it entirely once the page was split.
 */
const HOME_FILES = ["src/app/(public)/page.tsx", "src/app/(public)/home.tsx"].map((f) =>
  path.resolve(process.cwd(), f),
);

/** JSX text and string literals — what a visitor can end up reading. */
function readableText(src: string): string[] {
  const withoutComments = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const out: string[] = [];
  for (const m of withoutComments.matchAll(/>([^<>{}]{2,})</g)) out.push(m[1]!);
  for (const m of withoutComments.matchAll(/["'`]([^"'`\n]{2,})["'`]/g)) out.push(m[1]!);
  return out;
}

describe("the trial length on the homepage", () => {
  const sources = HOME_FILES.map((f) => ({ name: path.basename(f), src: fs.readFileSync(f, "utf8") }));

  it("is read from the plans the API sends", () => {
    expect(sources.some((s) => /trialDays/.test(s.src))).toBe(true);
  });

  it("is never written out as a literal number of days", () => {
    const literals = sources.flatMap(({ name, src }) =>
      readableText(src)
        .filter((x) => /\b\d+\s*days?\b/i.test(x))
        .map((x) => `${name}: ${x}`),
    );
    expect(
      literals,
      `these say a trial length the plan does not decide:\n${literals.join("\n")}`,
    ).toHaveLength(0);
  });
});
