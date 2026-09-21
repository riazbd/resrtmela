/**
 * `@rh/shared` runs in a browser.
 *
 * It is imported by the console, by every published resort site, and by the
 * phone — so anything in it that reaches for Node's standard library is a
 * bundle that will not build. Not a subtle failure either: webpack refuses
 * `node:crypto` outright and the whole application answers 500 on its next
 * page load, with a message about "unhandled scheme" that names the importing
 * file and not the one that did it.
 *
 * That happened on 2026-09-15, to a webhook signature that had every right to
 * exist and no business being here. It lives in the API now. This is the test
 * that would have said so first.
 *
 * `@rh/app-core` has the same guard for the DOM, from the other direction.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(__dirname, "..", "src");

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) found.push(full);
  }
  return found;
}

/**
 * Both spellings. `node:crypto` is the modern one and the one webpack names in
 * its error; `crypto`, `fs`, `path` and the rest are the bare forms, which
 * resolve to the same modules and fail the same way.
 */
const NODE_BUILTINS = [
  "node:",
  "crypto",
  "fs",
  "fs/promises",
  "path",
  "os",
  "child_process",
  "http",
  "https",
  "net",
  "dns",
  "dns/promises",
  "stream",
  "zlib",
  "worker_threads",
];

describe("what this package may import", () => {
  it("reaches for nothing that only exists in Node", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, "utf8");
      const imports = [...text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]!);
      for (const spec of imports) {
        const bare = spec.replace(/^node:/, "");
        if (spec.startsWith("node:") || NODE_BUILTINS.includes(bare)) {
          if (spec.startsWith(".")) continue;
          offenders.push(`${relative(SRC, file)} imports "${spec}"`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  /**
   * And nothing that only exists in a browser either: the API imports this
   * package too, and `window` in it would take the server down instead.
   */
  /**
   * A word on its own: `windowSize` and `documentUrl` are left alone, and so is
   * a module path — `export * from "./agent-window"` tripped this for two days
   * because a hyphen is not a word character (2026-09-19).
   *
   * And a field may be *called* one of these. `AgencyMoneyReceived`
   * carries `document: string` — what a payment was against — and a
   * property signature is a name being declared, not a global being
   * reached for. The name comes from the server, so the alternative was
   * to mistranslate a wire field to get past a guard, which is the tail
   * wagging the dog (2026-09-21).
   */
  const PROPERTY = /^\s*(window|document|localStorage|navigator)\??:/;
  const REACH = /(?<![\w.\-/])(window|document|localStorage|navigator)(?![\w-])/;
  // `String.fromCharCode(10)` for the same reason the comment stripper
  // below uses it: this file may not contain the character it splits on
  const LINE_BREAK = String.fromCharCode(10);
  const reachesForTheBrowser = (code: string) =>
    code.split(LINE_BREAK).some((line) => REACH.test(line) && !PROPERTY.test(line));

  it("catches a real reach for the browser", () => {
    expect(reachesForTheBrowser("const w = window.innerWidth;")).toBe(true);
    expect(reachesForTheBrowser("if (document) {}")).toBe(true);
    expect(reachesForTheBrowser("localStorage.getItem('x')")).toBe(true);
  });

  it("leaves a module path and a longer word alone", () => {
    expect(reachesForTheBrowser('export * from "./agent-window";')).toBe(false);
    expect(reachesForTheBrowser("const windowSize = 3;")).toBe(false);
    expect(reachesForTheBrowser("type BookingWindowDays = number;")).toBe(false);
  });

  it("leaves a field that is merely named after one alone", () => {
    expect(reachesForTheBrowser("  document: string;")).toBe(false);
    expect(reachesForTheBrowser("  navigator?: string | null;")).toBe(false);
    // and still catches one being read one line down
    expect(reachesForTheBrowser(`  document: string;${LINE_BREAK}  const d = document;`)).toBe(true);
  });

  it("reaches for nothing that only exists in a browser", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      // comments stripped first: this package explains at length why it does
      // not touch `window`, and a guard that reads its own prose as a
      // violation is a guard nobody can keep
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(new RegExp("//[^" + String.fromCharCode(10) + "]*", "g"), "");
      if (reachesForTheBrowser(code)) offenders.push(relative(SRC, file));
    }
    expect(offenders).toEqual([]);
  });
});
