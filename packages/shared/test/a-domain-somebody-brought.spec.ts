/**
 * Which host is which (2026-09-15 design, §4).
 *
 * One Next application serves the platform's marketing pages, the console, and
 * every resort's own site. The first two are at hostnames this deployment owns;
 * the third is at whatever domain the resort brought, so the `Host` header is
 * the only thing that separates them.
 *
 * Read it wrong and the console is served at a customer's domain, or a
 * customer's site where the console should be — so the rule is pure, tested
 * here, and the middleware is a few lines that call it. `Host` is also whatever
 * the client chose to send, and this value ends up in a database lookup.
 */
import { describe, expect, it } from "vitest";
import { dnsRecordFor, isOwnHost, normaliseHost, claimProblem } from "../src/domain";

const OURS = ["resortmela.com", "www.resortmela.com", "resortmela.rootcodebd.com"];

describe("reading a Host header", () => {
  it("lower-cases it and drops the port", () => {
    expect(normaliseHost("SkyEcoResort.com:443")).toBe("skyecoresort.com");
    expect(normaliseHost("  skyecoresort.com  ")).toBe("skyecoresort.com");
  });

  it("drops a trailing dot, which is a legal way to write a name", () => {
    expect(normaliseHost("skyecoresort.com.")).toBe("skyecoresort.com");
  });

  it("is nothing at all when it is not a hostname", () => {
    for (const bad of [
      "",
      "   ",
      "../etc/passwd",
      "a b.com",
      "evil.com/path",
      "-leading.com",
      "trailing-.com",
      "under_score.com",
      "x".repeat(300) + ".com",
      "..",
    ]) {
      expect(normaliseHost(bad)).toBeNull();
    }
  });

  it("is nothing when there is no header", () => {
    expect(normaliseHost(undefined)).toBeNull();
    expect(normaliseHost(null)).toBeNull();
  });
});

describe("telling our own hosts from a customer's", () => {
  it("knows the ones this deployment answers at", () => {
    for (const own of OURS) expect(isOwnHost(own, OURS)).toBe(true);
    expect(isOwnHost("RESORTMELA.COM:443", OURS)).toBe(true);
  });

  it("does not mistake a lookalike for one of ours", () => {
    // the trap a prefix or suffix test falls into
    expect(isOwnHost("resortmela.com.evil.example", OURS)).toBe(false);
    expect(isOwnHost("notresortmela.com", OURS)).toBe(false);
  });

  it("says no to a host that is not a host", () => {
    expect(isOwnHost("a b", OURS)).toBe(false);
  });
});

describe("a domain a resort may claim", () => {
  it("accepts an ordinary domain, and its www", () => {
    expect(claimProblem("skyecoresort.com", OURS)).toBeNull();
    expect(claimProblem("www.skyecoresort.com", OURS)).toBeNull();
    expect(claimProblem("stay.skyecoresort.com.bd", OURS)).toBeNull();
  });

  it("refuses one of ours, in a sentence rather than a code", () => {
    expect(claimProblem("resortmela.com", OURS)).toMatch(/ours|platform/i);
  });

  /**
   * A single label is not a public domain; an IP address is not a domain at
   * all, and a certificate authority will not issue for either. Refusing here
   * saves the owner a wait that ends in a failure nobody explains.
   */
  it("refuses something no certificate could ever be issued for", () => {
    expect(claimProblem("localhost", OURS)).toBeTruthy();
    expect(claimProblem("194.163.191.50", OURS)).toBeTruthy();
    expect(claimProblem("*.skyecoresort.com", OURS)).toBeTruthy();
  });

  it("refuses what is not a hostname at all", () => {
    expect(claimProblem("a b.com", OURS)).toBeTruthy();
    expect(claimProblem("", OURS)).toBeTruthy();
  });
});

describe("the record the owner has to add", () => {
  it("names the host and carries the token", () => {
    const rec = dnsRecordFor("skyecoresort.com", "abc123");
    expect(rec).toEqual({
      type: "TXT",
      name: "_resortmela.skyecoresort.com",
      shortName: "_resortmela",
      value: "abc123",
    });
  });

  /**
   * Registrars differ about whether the name is written whole or relative to
   * the zone, and an owner pasting the wrong one waits for a check that never
   * passes. Both spellings are given, and the screen shows them.
   */
  it("gives the short form too, for a registrar that wants it", () => {
    expect(dnsRecordFor("stay.skyecoresort.com", "t").shortName).toBe("_resortmela.stay");
  });
});
