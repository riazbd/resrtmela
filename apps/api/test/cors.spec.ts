/**
 * The CORS allow-list is an allow-list, not a suffix match.
 *
 * `/resortmela\.app$/` accepted `https://evil-resortmela.app`, and
 * `/localhost:\d+$/` accepted `http://notlocalhost:3000` — both with
 * `credentials: true`, so a page on either could read this API as the signed-in
 * user. The bug is easy to reintroduce by writing the "obvious" regex, which is
 * why the rule is pinned here.
 */
import { describe, expect, it } from "vitest";
import { originAllowed } from "../src/common/cors";

const noEnv = {} as NodeJS.ProcessEnv;

describe("corsOrigins", () => {
  it("allows the product's own domain and its subdomains", () => {
    expect(originAllowed("https://resortmela.app", noEnv)).toBe(true);
    expect(originAllowed("https://app.resortmela.app", noEnv)).toBe(true);
  });

  it("allows a developer's own machine", () => {
    expect(originAllowed("http://localhost:3000", noEnv)).toBe(true);
  });

  it("refuses a domain that merely ends in ours", () => {
    expect(originAllowed("https://evil-resortmela.app", noEnv)).toBe(false);
    expect(originAllowed("https://resortmela.app.attacker.com", noEnv)).toBe(false);
  });

  it("refuses a host that merely ends in localhost", () => {
    expect(originAllowed("http://notlocalhost:3000", noEnv)).toBe(false);
  });

  it("refuses our own domain over plain http", () => {
    expect(originAllowed("http://resortmela.app", noEnv)).toBe(false);
  });

  it("takes extra origins from the environment, exactly as written", () => {
    const env = { CORS_ORIGIN: "https://a.example.com, https://b.example.com" } as NodeJS.ProcessEnv;
    expect(originAllowed("https://a.example.com", env)).toBe(true);
    expect(originAllowed("https://b.example.com", env)).toBe(true);
    expect(originAllowed("https://c.example.com", env)).toBe(false);
  });
});
