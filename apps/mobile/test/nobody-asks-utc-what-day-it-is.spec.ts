/**
 * Nobody asks UTC what day it is (2026-09-21).
 *
 * The console had nine of these and this app has six, all on the agent
 * screens, all spelled `todayIn(undefined)` — which reads as "no zone in
 * particular" and means UTC, because that is what `todayIn` falls back
 * to. Bangladesh is UTC+6, so for the six hours after midnight every one
 * of them is a day behind: an expense filed at one in the morning lands
 * on yesterday, and a room search opens on a night already gone.
 *
 * A resort screen asks `activeResort.timezone` and is right. An agency
 * has no timezone — it is not a place, it sells across several — so
 * these name `PLATFORM_TIMEZONE`, which says out loud what
 * `undefined` was quietly getting wrong.
 *
 * `resort-dates.ts` opens with the same fault and the seven console
 * screens it was first found on. A comment did not keep it out. This
 * does, on this side too.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOTS = [join(__dirname, "..", "app"), join(__dirname, "..", "src")];

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, found);
    else if (/\.tsx?$/.test(entry.name)) found.push(full);
  }
  return found;
}

/**
 * Asking the clock for a date without naming a zone.
 *
 * `todayIn(undefined)` is the polite spelling and the dangerous one: it
 * looks deliberate. Stepping a date somebody already holds is untouched.
 */
const ASKS_UTC = [
  /todayIn\(undefined\)/,
  /new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/,
];

describe("nobody asks UTC what day it is", () => {
  const files = ROOTS.flatMap((r) => sourceFiles(r));

  it("finds the app at all", () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it("names a timezone wherever it wants today's date", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        // a line inside a comment is explaining the fault, not committing it
        if (/^\s*(\*|\/\/)/.test(lines[i])) continue;
        if (ASKS_UTC.some((re) => re.test(lines[i]))) {
          const where = relative(join(__dirname, ".."), file).split(sep).join("/");
          offenders.push(`${where}:${i + 1}  ${lines[i].trim().slice(0, 80)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * A resort screen still asks the resort, which is the whole point:
   * the constant is for the callers that genuinely have nobody to ask.
   */
  it("leaves a resort screen asking its own resort", () => {
    const daysheet = readFileSync(join(__dirname, "..", "app", "(tabs)", "(desk)", "daysheet.tsx"), "utf8");
    expect(daysheet).toMatch(/todayIn\(activeResort\?\.timezone\)/);
  });
});
