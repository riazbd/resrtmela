/**
 * An old app is told to stop (2026-09-21).
 *
 * There is no Play Store here. Staff download the APK from the website,
 * nothing updates anybody, and a phone installed once goes on calling
 * this API for as long as it is switched on. The floor is the server's,
 * and these are the rules it applies.
 */
import { describe, expect, it } from "vitest";
import {
  APP_PLATFORM_HEADER,
  APP_VERSION_HEADER,
  appStanding,
  compareVersions,
  mustUpdateMessage,
  UPGRADE_REQUIRED,
  UPGRADE_REQUIRED_CODE,
} from "../src/app-version";

const RELEASE = { latest: "0.7.0", minimum: "0.6.0" };

describe("which version is newer", () => {
  it("compares part by part", () => {
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("1.2.4", "1.2.3")).toBe(1);
    expect(compareVersions("1.3.0", "1.2.9")).toBe(1);
    expect(compareVersions("2.0.0", "1.99.99")).toBe(1);
  });

  /**
   * The one that matters, and the one a string comparison gets wrong:
   * `"0.10.0" < "0.9.0"` is true lexicographically. The bug appears
   * exactly once, at version ten, months after anybody last read this.
   */
  it("knows 0.10.0 is newer than 0.9.0", () => {
    expect(compareVersions("0.10.0", "0.9.0")).toBe(1);
    expect(compareVersions("0.9.0", "0.10.0")).toBe(-1);
    expect(compareVersions("1.0.10", "1.0.9")).toBe(1);
  });

  it("treats a missing part as zero", () => {
    expect(compareVersions("1", "1.0.0")).toBe(0);
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.1", "1")).toBe(1);
  });

  /** A build that cannot say what it is is not a build to trust. */
  it("reads nonsense as zero rather than throwing", () => {
    expect(compareVersions("", "0.0.1")).toBe(-1);
    expect(compareVersions("banana", "0.0.1")).toBe(-1);
  });

  /**
   * A pre-release is older than its release, as semver says.
   *
   * Splitting on every dot got this backwards: `beta` read as a zero
   * and the `2` after it as a fourth version part, so `0.7.0-beta.2`
   * compared as NEWER than `0.7.0` — and a beta would have walked
   * through a floor set at the release it is not yet.
   */
  it("puts a pre-release below its own release", () => {
    expect(compareVersions("0.7.0-beta.2", "0.7.0")).toBe(-1);
    expect(compareVersions("0.7.0", "0.7.0-beta.2")).toBe(1);
    expect(compareVersions("0.7.0-beta.2", "0.7.0-rc.1")).toBe(0);
    // and the numbers still win over the suffix
    expect(compareVersions("0.8.0-beta.1", "0.7.0")).toBe(1);
  });

  it("blocks a beta of the version that is the floor", () => {
    expect(appStanding("0.6.0-beta.3", RELEASE)).toBe("blocked");
  });
});

describe("where a running build stands", () => {
  it("says nothing about the newest", () => {
    expect(appStanding("0.7.0", RELEASE)).toBe("current");
  });

  it("says nothing about one ahead of the newest, either", () => {
    // a tester on tomorrow's build is not out of date
    expect(appStanding("0.8.0", RELEASE)).toBe("current");
  });

  it("offers an update between the floor and the newest", () => {
    expect(appStanding("0.6.0", RELEASE)).toBe("update");
    expect(appStanding("0.6.9", RELEASE)).toBe("update");
  });

  it("blocks below the floor", () => {
    expect(appStanding("0.5.0", RELEASE)).toBe("blocked");
    expect(appStanding("0.1.0", RELEASE)).toBe("blocked");
  });

  /** The floor is inclusive: the minimum itself still works. */
  it("lets the minimum through", () => {
    expect(appStanding("0.6.0", { latest: "0.6.0", minimum: "0.6.0" })).toBe("current");
  });

  /**
   * A caller with no version is the console, a script, or a phone built
   * before this rule existed. Refusing all three to catch the third
   * would take the console down with it.
   */
  it("has no verdict on a caller that did not say", () => {
    expect(appStanding(null, RELEASE)).toBeNull();
    expect(appStanding(undefined, RELEASE)).toBeNull();
    expect(appStanding("", RELEASE)).toBeNull();
    expect(appStanding("   ", RELEASE)).toBeNull();
  });
});

describe("what everyone agrees to call it", () => {
  /**
   * The app sets these and the API reads them. A typo in either is a
   * floor that silently never applies — the worst kind of safety rule,
   * the one that reports success.
   */
  it("names the headers once", () => {
    expect(APP_VERSION_HEADER).toBe("x-app-version");
    expect(APP_PLATFORM_HEADER).toBe("x-app-platform");
  });

  /**
   * 426, not 401: a 401 sends somebody to the sign-in screen, which is
   * the one thing that will not help them here.
   */
  it("refuses with Upgrade Required, not Unauthorized", () => {
    expect(UPGRADE_REQUIRED).toBe(426);
    expect(UPGRADE_REQUIRED).not.toBe(401);
    expect(UPGRADE_REQUIRED_CODE).toBe("app_update_required");
  });

  it("names the version a person has to reach", () => {
    expect(mustUpdateMessage({ latest: "0.7.0" })).toContain("0.7.0");
  });
});
