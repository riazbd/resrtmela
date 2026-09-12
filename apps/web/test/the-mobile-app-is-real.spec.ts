/**
 * The mobile app exists, and has actually been built.
 *
 * This replaces `the-mobile-app-is-gone.spec.ts`, written this morning, which
 * asserted the opposite. That test was right about the app it guarded — a
 * guest client for endpoints deleted on 2026-09-11 — and it is being removed
 * because the decision it encoded was reversed the same day, not because it
 * was wrong. See docs/superpowers/specs/2026-09-13-mobile-app-design.md.
 *
 * The interesting assertion here is the last one. The deleted app had eight
 * screens and about 1,400 lines, and every one of them type-checked. What it
 * never had was an `android.package`, a bundle identifier, or a single build:
 * it could not have been installed by anyone, and nobody noticed for months
 * because nothing in the repository could tell the difference between code
 * that ships and code that merely compiles.
 *
 * So the gate is not "the source is present". It is "a release artifact was
 * produced, and here is its hash". `pnpm -F @rh/mobile build:apk` appends that
 * line itself — the receipt is a by-product of building, which is the only
 * kind of claim worth trusting in a file somebody could also edit by hand.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = join(__dirname, "..", "..", "..");
const MOBILE = join(REPO, "apps", "mobile");

/** app.json / app.config.js — whichever Expo is reading. */
function appConfig(): Record<string, any> {
  const json = join(MOBILE, "app.json");
  if (!existsSync(json)) throw new Error("apps/mobile/app.json is missing");
  return JSON.parse(readFileSync(json, "utf8")).expo ?? {};
}

describe("the mobile app is real, not merely written", () => {
  it("is a workspace package", () => {
    const manifest = join(MOBILE, "package.json");
    expect(existsSync(manifest)).toBe(true);
    expect(JSON.parse(readFileSync(manifest, "utf8")).name).toBe("@rh/mobile");
  });

  it("declares the Android identity it will be installed under", () => {
    // the identity is the install: change it and every phone holding the old
    // one keeps it forever, as a second, stale app
    const expo = appConfig();
    expect(expo.android?.package).toBe("com.resortmela.app");
    expect(expo.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("has a command that produces an APK", () => {
    const scripts = JSON.parse(readFileSync(join(MOBILE, "package.json"), "utf8")).scripts ?? {};
    expect(Object.keys(scripts)).toContain("build:apk");
  });

  it("has produced at least one APK, and recorded its hash", () => {
    /**
     * RELEASES.md is written by the build script, one line per artifact:
     *   | 0.1.0 | 2026-09-13 | 42.1 MB | sha256:9f86d081… |
     * An empty table means the app has been written but never built — exactly
     * the state the last one died in.
     */
    const receipts = join(MOBILE, "RELEASES.md");
    expect(existsSync(receipts)).toBe(true);
    const builds = readFileSync(receipts, "utf8")
      .split("\n")
      .filter((line) => /\|\s*sha256:[0-9a-f]{64}\s*\|/.test(line));
    expect(builds.length).toBeGreaterThan(0);
  });

  it("is not still described as dropped in the roadmap", () => {
    // ROADMAP.md is read as what is still true; this morning it said the app
    // was deleted and would not return
    const sections = readFileSync(join(REPO, "ROADMAP.md"), "utf8").split(/^### /m);
    const stale = sections
      .filter((s) => /\*\*Dropped \(2026-09-13\)/.test(s) && /apps\/mobile/.test(s))
      .map((s) => `### ${s.split("\n")[0]}`);
    expect(stale.join("\n")).toBe("");
  });
});
