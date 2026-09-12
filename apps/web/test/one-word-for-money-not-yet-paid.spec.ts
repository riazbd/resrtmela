/**
 * One word for money that has not been paid yet.
 *
 * The console had two. A column said "Owed by", a card said "What each agency
 * owes", a calendar legend said "Money owed", an agent's booking said "You owe
 * the resort" — while every number beside them was headed "Due", the screen
 * listing them is called Dues, and the dashboard tile says "Outstanding dues".
 * Two words for one idea reads as two ideas, and the reader has to work out
 * whether they are the same thing before they can act on either.
 *
 * "Due" wins because it is the one already on every amount, in the navigation,
 * and in the API's own field names. This is not a style preference; it is the
 * reason the reader asked for the change.
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
 * Text a person actually reads: JSX between tags, and quoted strings that are
 * plainly prose. Comments are excluded — they explain the code to whoever
 * maintains it, and "what is still owed" is fine English there.
 */
function readableText(src: string): string[] {
  const withoutComments = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const out: string[] = [];
  // >…< : anything rendered between JSX tags
  for (const m of withoutComments.matchAll(/>([^<>{}]{3,})</g)) out.push(m[1]!);
  // "…" and `…` : titles, placeholders, toast messages
  for (const m of withoutComments.matchAll(/["'`]([^"'`\n]{6,})["'`]/g)) out.push(m[1]!);
  return out;
}

describe("the console's word for money not yet paid", () => {
  const files = sourceFiles(SRC);

  it("finds the console at all", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("never says owed, owes or owe to the reader", () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const text of readableText(fs.readFileSync(file, "utf8"))) {
        if (/\b(owed|owes|owe)\b/i.test(text)) {
          offenders.push(`${path.relative(SRC, file)}: "${text.trim().slice(0, 70)}"`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toHaveLength(0);
  });
});
