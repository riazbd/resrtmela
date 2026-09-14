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
  it("reaches for nothing that only exists in a browser", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      // comments stripped first: this package explains at length why it does
      // not touch `window`, and a guard that reads its own prose as a
      // violation is a guard nobody can keep
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(new RegExp("//[^" + String.fromCharCode(10) + "]*", "g"), "");
      // a word on its own, so `windowSize` and `documentUrl` are left alone
      if (/(?<![\w.])(window|document|localStorage|navigator)(?![\w])/.test(code)) {
        offenders.push(relative(SRC, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
