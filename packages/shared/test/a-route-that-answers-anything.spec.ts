/**
 * A route that answers `unknown` is not a typed route (2026-09-21).
 *
 * `client.ts` is the one description of the API every client reads. For
 * most of its life it described 22 routes as `unknown` and 20 request
 * bodies the same way — which means a screen calling one of them had two
 * options, and both are worse than no type at all:
 *
 *   - **cast it.** The console did, 64 times, to interfaces hand-written
 *     a few lines above the call. A cast is an assertion, not a check, so
 *     the compiler stops looking and the browser finds out instead.
 *   - **treat it as unknown.** Nobody does; it makes the screen
 *     unwriteable.
 *
 * Two live faults came out of the sweep that ended this, and neither
 * could have been caught while the routes answered `unknown`:
 *
 *   - the Resorts tab printed a subscription's `scheduleLabel`, which
 *     `allResorts` had never selected. The badge was blank on every row
 *     and the renew button offered "one more  period".
 *   - `platform.renew` took `months` and the server counts *periods*,
 *     so renewing a yearly account by one would have been read as one
 *     year where the caller meant one month — or the reverse, depending
 *     on who was reading the parameter name.
 *
 * So this test is not tidiness. It is the only thing standing between a
 * new route and the next silent cast.
 *
 * **`Record<string, unknown>` is allowed**, and only that: a setting bag
 * and an option's `meta` are genuinely open JSON, and saying so is a
 * description rather than a gap. Everything else — a bare `unknown`
 * response, a bare `unknown` body — fails here.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(join(__dirname, "../src/client.ts"), "utf8");

/** Lines, with the `http` helper's own signature taken out of the way. */
function routeLines(): { line: string; n: number }[] {
  return SOURCE.split("\n")
    .map((line, i) => ({ line, n: i + 1 }))
    // the helper itself takes `body?: unknown`, which is the whole point
    // of a helper: it serialises whatever a typed route hands it
    .filter(({ line }) => !line.includes("opts?: { method?: string; body?: unknown }"));
}

describe("every route says what it answers", () => {
  it("has no `http<unknown>` left", () => {
    const loose = routeLines().filter(({ line }) => /http<unknown\b/.test(line));
    expect(loose.map(({ n, line }) => `${n}: ${line.trim()}`)).toEqual([]);
  });

  it("has no `unknown[]` answer either", () => {
    const loose = routeLines().filter(({ line }) => /http<unknown\[\]>/.test(line));
    expect(loose.map(({ n, line }) => `${n}: ${line.trim()}`)).toEqual([]);
  });
});

describe("every route says what it accepts", () => {
  /**
   * A body typed `unknown` accepts a misspelled field, a number sent as
   * a string, and an object meant for a different route. The server
   * notices, at the counter, in front of a guest.
   */
  it("has no `body: unknown`", () => {
    const loose = routeLines().filter(({ line }) => /\bbody\??: unknown\b/.test(line));
    expect(loose.map(({ n, line }) => `${n}: ${line.trim()}`)).toEqual([]);
  });

  /**
   * `Record<string, unknown>` stays legal where the JSON really is open
   * — but not as a body's whole type, which is the same gap wearing a
   * longer name. `taxRules.update` was exactly that until today.
   */
  it("does not use an open record as a whole body", () => {
    const loose = routeLines().filter(({ line }) =>
      /\bbody\??: Record<string, unknown>/.test(line),
    );
    expect(loose.map(({ n, line }) => `${n}: ${line.trim()}`)).toEqual([]);
  });
});
