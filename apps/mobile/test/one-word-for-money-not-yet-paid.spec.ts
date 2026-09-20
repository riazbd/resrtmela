/**
 * One word for money that has not been paid yet — the phone's copy
 * (2026-09-21).
 *
 * The console settled this and the app never heard. Signing into the
 * phone as the agency, the Quotes screen read **"Still owed"** over a
 * figure, with an **"Owing"** lens beside it and a card headed **"Still
 * owing"** — while every amount under them is a `due`, the resort side
 * calls the same screen Dues, and the console's own
 * `one-word-for-money-not-yet-paid` has banned those words from reader
 * text since it was written.
 *
 * Two words for one idea reads as two ideas, and somebody moving
 * between the desk and the phone has to decide whether they are the
 * same thing before they can act on either. "Due" wins for the same
 * reason it won there: it is already on every amount, in the
 * navigation, and in the API's field names.
 *
 * A rule enforced on one client and not the other is not a rule. This
 * is the third time that has bitten today — the icon fallback and the
 * sidebar dictionary were the other two — so the check is copied here
 * rather than left implied.
 *
 * Comments are excluded, deliberately: "what the stay owes" is fine
 * English in a note to the next maintainer, and the ban is on what a
 * reader sees.
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
 * Text a person actually reads: JSX between tags, and quoted strings
 * that are plainly prose. The same extractor the console uses, so the
 * two clients are held to one standard by one method.
 */
function readableText(src: string): string[] {
  const withoutComments = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    // What sits inside a template's ${…} is code, not prose. `owes` there
    // is a local variable and `all.filter(owing)` is a predicate; neither
    // reaches a reader. The console's copy of this check shares the blind
    // spot and has simply never had a variable spelled that way.
    .replace(/\$\{[^}]*\}/g, " ");
  const out: string[] = [];
  for (const m of withoutComments.matchAll(/>([^<>{}]{3,})</g)) out.push(m[1]!);
  for (const m of withoutComments.matchAll(/["'`]([^"'`\n]{4,})["'`]/g)) out.push(m[1]!);
  return out;
}

describe("the app's word for money not yet paid", () => {
  const files = ROOTS.flatMap((r) => sourceFiles(r));

  it("finds the app at all", () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it("never says owed, owes, owe or owing to the reader", () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const text of readableText(readFileSync(file, "utf8"))) {
        if (/\b(owed|owes|owe|owing)\b/i.test(text)) {
          const where = relative(join(__dirname, ".."), file).split(sep).join("/");
          offenders.push(`${where}: "${text.trim().slice(0, 60)}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  /** The word it says instead is already everywhere; this proves it. */
  it("says due, on the screen the resort side calls Dues", () => {
    const payments = readFileSync(
      join(__dirname, "..", "app", "(tabs)", "(desk)", "payments.tsx"),
      "utf8",
    );
    expect(payments).toMatch(/Dues/);
  });
});
