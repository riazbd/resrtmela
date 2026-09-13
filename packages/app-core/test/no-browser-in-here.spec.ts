/**
 * The rule that makes this package worth having.
 *
 * These tests render with react-dom in jsdom, because rendering a hook needs
 * some renderer and that is the one this repo already has. That harness is a
 * convenience for the tests and must never become a permission for the source:
 * React Native has no `window`, no `document`, no `localStorage` and no
 * react-dom, and a module that quietly reaches for one of them will pass every
 * test here and crash on the first phone that opens it.
 *
 * So the rule is checked rather than trusted. It is checked against the source
 * with comments removed — half the files in here *discuss* localStorage, since
 * explaining why the storage port exists is most of what those comments are
 * for.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = join(__dirname, "..", "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

/** Code only: a comment saying "localStorage" is documentation, not a reach for one. */
function codeOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /\bwindow\s*[.[]/, why: "`window` — React Native has none; take a port instead" },
  { pattern: /\bdocument\s*[.[]/, why: "`document` — React Native has no DOM" },
  { pattern: /\blocalStorage\b|\bsessionStorage\b/, why: "storage — use the Storage port" },
  { pattern: /\bnavigator\s*[.[]/, why: "`navigator` — differs on every platform" },
  { pattern: /from\s+["']react-dom/, why: "react-dom — React Native renders with its own renderer" },
];

describe("nothing in src reaches for a browser", () => {
  const files = sourceFiles(SRC);

  it("finds source files to check, so a passing run means something", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s", (file) => {
    const code = codeOf(readFileSync(file, "utf8"));
    const found = FORBIDDEN.filter((rule) => rule.pattern.test(code)).map((rule) => rule.why);
    expect(found).toEqual([]);
  });
});
