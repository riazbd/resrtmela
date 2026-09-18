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
import { originAllowed, readableFromAnywhere } from "../src/common/cors";

const noEnv = {} as NodeJS.ProcessEnv;

describe("corsOrigins", () => {
  it("allows the product's own domain and its subdomains", () => {
    expect(originAllowed("https://resortmela.com", noEnv)).toBe(true);
    expect(originAllowed("https://app.resortmela.com", noEnv)).toBe(true);
  });

  /**
   * `resortmela.app` was the built-in rule for a year and is not a domain this
   * platform owns. Whoever registers it should not inherit a credentialed read
   * of every signed-in user's API (2026-09-19).
   */
  it("does not still allow the domain the platform never moved to", () => {
    expect(originAllowed("https://resortmela.app", noEnv)).toBe(false);
  });

  it("allows a developer's own machine", () => {
    expect(originAllowed("http://localhost:3000", noEnv)).toBe(true);
  });

  it("refuses a domain that merely ends in ours", () => {
    expect(originAllowed("https://evil-resortmela.com", noEnv)).toBe(false);
    expect(originAllowed("https://resortmela.com.attacker.com", noEnv)).toBe(false);
  });

  it("refuses a host that merely ends in localhost", () => {
    expect(originAllowed("http://notlocalhost:3000", noEnv)).toBe(false);
  });

  it("refuses our own domain over plain http", () => {
    expect(originAllowed("http://resortmela.com", noEnv)).toBe(false);
  });

  it("takes extra origins from the environment, exactly as written", () => {
    const env = { CORS_ORIGIN: "https://a.example.com, https://b.example.com" } as NodeJS.ProcessEnv;
    expect(originAllowed("https://a.example.com", env)).toBe(true);
    expect(originAllowed("https://b.example.com", env)).toBe(true);
    expect(originAllowed("https://c.example.com", env)).toBe(false);
  });
});

/**
 * A resort's published site is served at the resort's own domain and asks this
 * API, from the guest's browser, whether anything is free. That origin is a
 * customer's domain — it can never be on an allow-list written in advance, and
 * the allow-list is what the "Is anything free?" box would silently fail on
 * (2026-09-19).
 *
 * These paths are public, unauthenticated reads, so they answer any origin at
 * all. Nothing else does.
 */
describe("what a stranger's browser may read from anywhere", () => {
  it("is the published-site reads, which carry no session", () => {
    expect(readableFromAnywhere("/site/sky-eco-resort/vacancy")).toBe(true);
    expect(readableFromAnywhere("/site/agency/elite/resorts/sky/vacancy")).toBe(true);
    expect(readableFromAnywhere("/site/render/sky-eco-resort")).toBe(true);
  });

  it("ignores a query string, which is not part of the path", () => {
    expect(readableFromAnywhere("/site/sky/vacancy?from=2026-01-01")).toBe(true);
  });

  it("is nothing else", () => {
    for (const p of ["/bookings", "/auth/login", "/platform/users", "/domains/lookup", "/"]) {
      expect(readableFromAnywhere(p)).toBe(false);
    }
  });

  it("is not a path that merely starts with the letters", () => {
    expect(readableFromAnywhere("/sitemap")).toBe(false);
    expect(readableFromAnywhere("/sites/1")).toBe(false);
  });
});
