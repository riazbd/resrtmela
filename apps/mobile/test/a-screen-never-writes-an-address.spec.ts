/**
 * §0.3's rule, checked rather than trusted (2026-09-20).
 *
 * The design says it in one line: *a native screen never builds a URL*. The
 * reason is not tidiness. The console did the opposite — ten of its forty page
 * files use the typed client and the other thirty write their paths out, a
 * hundred and ten of them — and the cost came due the day a second client was
 * started: two apps that each know the API by heart disagree within a month,
 * and the disagreement is found by a user rather than a compiler.
 *
 * Writing the desk's slice of the client showed how that rot looks from
 * inside. Four of its methods were wrong — one posted to a route that has
 * never existed — and every one of them was wrong precisely because the
 * console was not leaning on it.
 *
 * So the app leans on it, and this is what makes that a fact rather than an
 * intention: nothing outside `src/api/` may name the API, reach the network,
 * or build a client of its own. A screen that wants a route the client lacks
 * cannot write the route — it has to add it to `packages/shared/src/client.ts`,
 * where the console gets it too.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const MOBILE = join(__dirname, "..");

/**
 * The two places that are allowed to know where the API is.
 *
 * `src/api/` is the transport itself — someone has to hold the base URL and
 * call `fetch`. `src/console/` is release 0.1.0's WebView, which is a URL by
 * definition; it is not a screen written against this rule, it is the thing
 * the rule replaces, and phase 4 deletes it. Both are named rather than
 * silently skipped, and the last test here fails if one stops existing, so an
 * exemption cannot outlive its reason.
 */
const MAY_NAME_THE_API = [join("src", "api"), join("src", "console")];

/** The directories a screen can live in. `test/` is not one of them. */
const WALKED = ["src", "app"];

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Comment lines are prose; this very file's rule is quoted in several of them. */
const withoutComments = (src: string) =>
  src
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l))
    .join("\n");

function screenFiles(): { path: string; name: string; code: string }[] {
  const out: { path: string; name: string; code: string }[] = [];
  for (const dir of WALKED) {
    for (const file of filesUnder(join(MOBILE, dir))) {
      const name = relative(MOBILE, file);
      if (MAY_NAME_THE_API.some((allowed) => name.startsWith(allowed))) continue;
      out.push({ path: file, name, code: withoutComments(readFileSync(file, "utf8")) });
    }
  }
  return out;
}

/** What a file is doing wrong, named so a failure reads as an instruction. */
const FORBIDDEN: { what: RegExp; why: string }[] = [
  { what: /\bfetch\s*\(/, why: "calls fetch — ask `client` for it instead" },
  { what: /\bXMLHttpRequest\b/, why: "reaches the network directly" },
  { what: /\bAPI_URL\b/, why: "names where the API is" },
  { what: /EXPO_PUBLIC_API_URL/, why: "reads the API's address out of the environment" },
  { what: /\bcreateApiClient\s*\(/, why: "builds a second client — there is one, in src/api" },
  { what: /\bmakeApi\s*\(/, why: "builds a second transport" },
  { what: /["'`]https?:\/\//, why: "writes an absolute URL" },
];

describe("a screen never builds a URL", () => {
  it("walks something, so a passing run is not an empty one", () => {
    // a guard that silently stops finding files passes forever; this is the
    // floor, well under the 68 screens the app ends with
    expect(screenFiles().length).toBeGreaterThan(10);
  });

  it("leaves naming the API to the one module that has to", () => {
    const offenders: string[] = [];
    for (const file of screenFiles()) {
      for (const rule of FORBIDDEN) {
        if (rule.what.test(file.code)) offenders.push(`${file.name} ${rule.why}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * The subtler half of the same rule.
   *
   * A screen may well navigate to `/bookings/41` — that is expo-router's
   * business and none of this spec's. What it may not do is hand a path to
   * something that will send it: the queue takes a path, and a screen that
   * writes one there has hand-written an address by another door.
   */
  it("does not hand a hand-written path to anything that sends it", () => {
    const offenders: string[] = [];
    for (const file of screenFiles()) {
      const found = file.code.match(/\bpath:\s*[`"'][^`"']*\//g);
      if (found) offenders.push(`${file.name}: ${found.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });

  it("exempts only directories that still exist", () => {
    for (const allowed of MAY_NAME_THE_API) {
      expect(statSync(join(MOBILE, allowed)).isDirectory()).toBe(true);
    }
  });
});

/**
 * The other side of the rule: there has to be something to use instead.
 *
 * A prohibition with no alternative is how a guard gets commented out on a
 * Friday. `src/api/session.ts` exports the one client, already carrying the
 * token, and every screen reaches the API through it.
 */
describe("what a screen uses instead", () => {
  it("is one client, built once, exported from src/api", () => {
    const session = readFileSync(join(MOBILE, "src", "api", "session.tsx"), "utf8");
    expect(session).toContain("export const client = createApiClient(api)");
  });

  it("is the same client the console has, from @rh/shared", () => {
    const session = readFileSync(join(MOBILE, "src", "api", "session.tsx"), "utf8");
    expect(session).toContain('from "@rh/shared"');
  });
});
