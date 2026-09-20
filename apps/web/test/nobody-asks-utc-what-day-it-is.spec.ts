/**
 * Nobody asks UTC what day it is (2026-09-21).
 *
 * `resort-dates.ts` opens with this fault and the list of seven console
 * screens it was found on. It was fixed there, `todayIn` was written for
 * it, and then it came back — eight more places, each with its own copy
 * of `new Date().toISOString().slice(0, 10)`.
 *
 * Bangladesh is UTC+6, so for the six hours after midnight every one of
 * those reads **yesterday**. The one that gave it away: at two in the
 * morning the console's booking form opened pre-filled with the 20th
 * while the resort was on the 21st, so the new housekeeping mark — shown
 * when check-in is today — stayed silent. The mark was right. The date
 * was a day behind, and a clerk pressing Create would have sold a night
 * that had already gone.
 *
 * Also caught: `DateNav`'s **Today** button, which is one component
 * behind every dated screen on the desk, so "go back to today" went to
 * yesterday on all of them at once.
 *
 * A comment at the top of a file did not keep this out. This does.
 *
 * What is still allowed is arithmetic on a date somebody already holds —
 * `new Date(`${iso}T00:00:00Z`)` stepped in UTC is correct and
 * deliberate, because adding twenty-four local hours lands on the same
 * day twice a year. What is banned is *asking the clock what today is*
 * without naming a zone.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(process.cwd(), "src");

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, found);
    else if (/\.tsx?$/.test(entry.name)) found.push(full);
  }
  return found;
}

/**
 * `new Date()` with no argument, turned straight into a date string.
 *
 * Both spellings that appeared: through `toISOString()` and through the
 * console's own `iso()` helper, which is the same call wearing a hat.
 */
const ASKS_UTC = [
  /new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/,
  /\biso\(new Date\(\)\)/,
  /new Date\(Date\.now\(\)\s*\+\s*86[_,]?400[_,]?000\)\.toISOString\(\)\.slice\(0,\s*10\)/,
  /\biso\(new Date\(Date\.now\(\)/,
];

describe("nobody asks UTC what day it is", () => {
  const files = sourceFiles(SRC);

  it("finds the console at all", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("names a timezone wherever it wants today's date", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = fs.readFileSync(file, "utf8");
      const lines = src.split("\n");
      for (let i = 0; i < lines.length; i++) {
        // a line inside a comment is explaining the fault, not committing it
        if (/^\s*(\*|\/\/)/.test(lines[i])) continue;
        if (ASKS_UTC.some((re) => re.test(lines[i]))) {
          offenders.push(`${path.relative(SRC, file)}:${i + 1}  ${lines[i].trim().slice(0, 80)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * The counterpart: stepping a date the caller already has stays legal,
   * so the rule cannot be satisfied by deleting the date arithmetic.
   */
  it("leaves UTC arithmetic on a date string alone", () => {
    const patterns = fs.readFileSync(path.join(SRC, "components/patterns.tsx"), "utf8");
    expect(patterns).toMatch(/new Date\(`\$\{value\}T00:00:00Z`\)/);
  });
});
