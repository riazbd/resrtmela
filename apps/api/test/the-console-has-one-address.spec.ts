/**
 * Every link the API mails out points at the same console (2026-09-19).
 *
 * Three names had grown for one thing — `PUBLIC_WEB_URL` for the password
 * reset and the agency invitation, `WEB_ORIGIN` for the unsubscribe header,
 * `WEB_URL` for the cache ping — and each fell back to a production hostname
 * written into the source. In production only `WEB_URL` was ever set, so two
 * of the three ran on the fallback and nobody noticed: the fallback happened
 * to be the right address.
 *
 * It stops being the right address the day the platform moves to its own
 * domain, and the failure is a password-reset mail that leads to a dead host.
 * So the answer is one function, tested here, and no hostname in the source.
 */
import { describe, expect, it } from "vitest";
import { isWebUrlConfigured, webUrl } from "../src/common/web-url";

const env = (o: Record<string, string | undefined>) => o as NodeJS.ProcessEnv;

describe("the address the console is reached at", () => {
  it("is what the deployment says it is", () => {
    expect(webUrl(env({ PUBLIC_WEB_URL: "https://resortmela.com" }))).toBe("https://resortmela.com");
  });

  it("answers the older spellings too, so one move updates every link", () => {
    expect(webUrl(env({ WEB_URL: "https://resortmela.com" }))).toBe("https://resortmela.com");
    expect(webUrl(env({ WEB_ORIGIN: "https://resortmela.com" }))).toBe("https://resortmela.com");
  });

  it("prefers the most specific spelling when a deployment sets several", () => {
    expect(
      webUrl(env({ PUBLIC_WEB_URL: "https://new.example", WEB_URL: "https://old.example" })),
    ).toBe("https://new.example");
  });

  it("drops a trailing slash, because every caller appends a path", () => {
    expect(webUrl(env({ PUBLIC_WEB_URL: "https://resortmela.com/" }))).toBe("https://resortmela.com");
    expect(webUrl(env({ PUBLIC_WEB_URL: "  https://resortmela.com//  " }))).toBe("https://resortmela.com");
  });

  /**
   * A developer's machine, not a production hostname. A source-level fallback
   * that looks like a real deployment is how the old bug hid for months: it
   * worked, so nothing said the variable was unset.
   */
  it("falls back to this machine, never to somebody's production", () => {
    expect(webUrl(env({}))).toBe("http://localhost:3000");
    expect(webUrl(env({ PUBLIC_WEB_URL: "   " }))).toBe("http://localhost:3000");
  });

  it("is not configured, and says so, so a deployment can be told at boot", () => {
    expect(isWebUrlConfigured(env({}))).toBe(false);
    expect(isWebUrlConfigured(env({ WEB_ORIGIN: "https://resortmela.com" }))).toBe(true);
  });
});

/**
 * The guard that keeps the fix from rotting. A URL to one of our own hosts,
 * written in the source, is the bug this file exists to remove — whichever host
 * it names, because the next move will make today's right answer wrong too.
 */
describe("no absolute link to our own site is written into the API's source", () => {
  it("is true of every file under src", async () => {
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const ABSOLUTE_OURS = /https?:\/\/[a-z0-9.-]*(rootcodebd|resortmela)\.(com|app)/;
    // prose may name a host — the comment in `common/cors.ts` names the one
    // that was the security hole, and removing it would remove the warning
    const code = (src: string) =>
      src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (name.endsWith(".ts") && ABSOLUTE_OURS.test(code(readFileSync(p, "utf8")))) offenders.push(p);
      }
    };
    walk(join(__dirname, "..", "src"));
    expect(offenders).toEqual([]);
  });
});
