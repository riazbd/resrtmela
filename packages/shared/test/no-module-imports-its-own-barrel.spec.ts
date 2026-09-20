/**
 * A module in here does not import the barrel that re-exports it.
 *
 * `index.ts` re-exports every module in this package. A module that
 * imports from `./index` therefore imports something that imports it
 * back, and a bundler resolves that by evaluation order: whichever one
 * loses the race sees `undefined` where a function should be.
 *
 * Three modules did it — `quote-bill`, `stay-bill` and `room-status`,
 * all reaching for `formatMoney` — and it was found by opening the app
 * on a real phone, where Metro prints the cycle to the app's own console
 * on every launch:
 *
 *     Require cycle: packages/shared/src/index.ts ->
 *     packages/shared/src/quote-bill.ts -> packages/shared/src/index.ts
 *     Require cycles are allowed, but can result in uninitialized values.
 *
 * Nothing else would ever have said so. Vitest resolves modules its own
 * way and 273 tests were green throughout; tsc does not care; the console
 * bundles it without complaint. It is a runtime hazard visible only where
 * the runtime speaks up.
 *
 * **The API renders invoices with `formatMoney`**, so the eventual failure
 * is a blank amount on a bill a guest keeps. That is why this is a rule
 * and not a tidy-up: it is cheap to obey and the way it breaks is silent.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..", "src");

const modules = readdirSync(SRC)
  .filter((f) => f.endsWith(".ts") && f !== "index.ts")
  .map((f) => ({ name: f, code: readFileSync(join(SRC, f), "utf8") }));

describe("the shape of this package's imports", () => {
  it("has modules to check", () => {
    expect(modules.length).toBeGreaterThan(20);
  });

  it("has nothing importing ./index, which re-exports everything", () => {
    const guilty = modules
      .filter(({ code }) => /from\s+["']\.\/index["']/.test(code))
      .map(({ name }) => name);
    expect(guilty).toEqual([]);
  });

  /**
   * The same hazard one step out. A module importing the package by its
   * own name resolves to the same barrel by another road.
   */
  it("has nothing importing @rh/shared from inside @rh/shared", () => {
    const guilty = modules
      .filter(({ code }) => /from\s+["']@rh\/shared["']/.test(code))
      .map(({ name }) => name);
    expect(guilty).toEqual([]);
  });

  /**
   * And the bottom of the graph stays at the bottom. `money` is what the
   * three cycling modules needed; if it ever reaches back up into one of
   * them the circle returns under a different name.
   */
  it("keeps money at the bottom, importing nothing of ours", () => {
    const money = readFileSync(join(SRC, "money.ts"), "utf8");
    const ours = money.match(/from\s+["']\.\/[^"']+["']/g) ?? [];
    expect(ours).toEqual([]);
  });
});
