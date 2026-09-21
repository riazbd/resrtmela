/**
 * A screen does not know a URL (2026-09-21).
 *
 * `@rh/shared`'s `client.ts` is the one description of this API that
 * every client reads. The console had a second one, spread across the
 * files it renders: around a hundred and thirty calls through its own
 * `api()` wrapper, each with the path written into the JSX and an
 * interface written a few lines above it.
 *
 * That is not a style preference. Two of the drifts it hid cost real
 * things, and both were invisible until the routes were typed:
 *
 *   - the platform panel's Resorts tab printed a subscription's
 *     `scheduleLabel`, which `allResorts` had never selected — so the
 *     badge was blank on every row and the renew tooltip read "Renew for
 *     one more  period";
 *   - the public invoice page printed `inv.rent`, a field `InvoicePayload`
 *     did not carry, because the payload was typed from the console's
 *     JSX rather than from `bookingTotals`.
 *
 * Both would have been build failures if the page had gone through the
 * typed client. So the rule is the rule, and this is what keeps it.
 *
 * **Two exemptions, and they are the point rather than a loophole.**
 * `lib/api.ts` is where `api()` lives and where `client` is built from
 * it. `lib/outbox.tsx` replays writes an offline device recorded
 * earlier: it is handed a path and a body it did not choose, hours
 * after the screen that chose them has gone, so a path is genuinely the
 * only thing it can be given.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "../src");

/** The two files that are allowed to name a route, and why, above. */
const MAY_NAME_A_ROUTE = ["lib/api.ts", "lib/outbox.tsx"];

function everyFile(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return everyFile(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

/**
 * A call to the raw wrapper, with the comments taken out first.
 *
 * Two files describe the arrangement they replaced, in prose, quoting
 * `api<That>("/platform/...")`. A guard that cannot tell a sentence from
 * a call would forbid explaining itself.
 */
function rawCalls(source: string): string[] {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  return code.split("\n").filter((line) => /(^|[^A-Za-z.])api\s*(<[^>]*>)?\s*\(/.test(line));
}

describe("the console reaches the API through one door", () => {
  it("has no screen calling the raw wrapper", () => {
    const offenders: string[] = [];
    for (const file of everyFile(SRC)) {
      const rel = relative(SRC, file).replace(/\\/g, "/");
      if (MAY_NAME_A_ROUTE.includes(rel)) continue;
      for (const line of rawCalls(readFileSync(file, "utf8"))) {
        offenders.push(`${rel}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * The exemptions are named, not inferred. A file that stops needing
   * one should lose it, and the only way to notice is to check that
   * each still uses what it was excused for.
   */
  it("keeps no exemption it has stopped needing", () => {
    for (const rel of MAY_NAME_A_ROUTE) {
      const source = readFileSync(join(SRC, rel), "utf8");
      expect(rawCalls(source).length, `${rel} no longer calls api() — drop its exemption`).toBeGreaterThan(0);
    }
  });
});
