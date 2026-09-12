/**
 * The Expo app, deleted rather than frozen.
 *
 * It was frozen on 2026-09-11 — taken out of the turbo pipelines with a
 * `FROZEN.md` explaining why — and deleted outright two days later. Freezing
 * had already stopped it costing build time, so what is left to protect
 * against is not cost but *belief*: a workspace entry, an env var, or a
 * roadmap line saying a mobile app exists is a claim somebody will act on. The
 * app never had an `android.package`, never had a bundle identifier, and was
 * never built once; and the guest endpoints it called were removed the same
 * week the platform stopped having guest accounts. Anyone who revives it from
 * a leftover reference revives a client for a server that is gone.
 *
 * So this reads the repository itself. A type check cannot see a stale
 * `pnpm-workspace` glob or an `EXPO_PUBLIC_API_URL` sitting in the env
 * template, which is exactly why those are the parts that rot quietly.
 *
 * What it deliberately does NOT touch: the `APP` booking source. That is a
 * per-resort entry in the options registry meaning "the booking came through
 * an app" — an OTA's, the resort's own — and has never had anything to do
 * with this repository's Expo project. Deleting our app is not a reason to
 * edit a resort's dropdown.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const REPO = join(__dirname, "..", "..", "..");

describe("the mobile app is gone, not merely quiet", () => {
  it("has no apps/mobile directory", () => {
    expect(existsSync(join(REPO, "apps", "mobile"))).toBe(false);
  });

  it("has no workspace package claiming to be the mobile app", () => {
    const names = readdirSync(join(REPO, "apps"))
      .map((app) => join(REPO, "apps", app, "package.json"))
      .filter((manifest) => existsSync(manifest))
      .map((manifest) => JSON.parse(readFileSync(manifest, "utf8")).name);
    expect(names).not.toContain("@rh/mobile");
  });

  it("offers no Expo environment variable for someone to fill in", () => {
    // .env.example is the committed contract — a var listed there reads as a
    // setting the platform still wants
    const example = readFileSync(join(REPO, ".env.example"), "utf8");
    const expoVars = example
      .split("\n")
      .filter((line) => /^\s*EXPO_[A-Z_]+\s*=/.test(line))
      .map((line) => line.trim());
    expect(expoVars.join("\n")).toBe("");
  });

  it("does not promise a mobile release in the roadmap", () => {
    /**
     * ROADMAP.md is read as a list of things still to do, unlike PLAN*.md and
     * the dated entries in STATUS.md, which are a record of what happened. So
     * the app may still be *named* there — the file marks closed items rather
     * than deleting them, and "why there is no mobile app" is worth answering
     * once for whoever asks next. What it may not do is leave the question
     * open. Hence the check is per section, not per line: a section that
     * mentions the app has to carry the same bold closure marker the file's
     * other retired items use.
     */
    const sections = readFileSync(join(REPO, "ROADMAP.md"), "utf8").split(/^### /m);
    const open = sections
      .filter((s) => /apps\/mobile|Expo app|EXPO_PUBLIC/.test(s))
      .filter((s) => !/\*\*(Dropped|Superseded)\b/.test(s))
      .map((s) => `### ${s.split("\n")[0]}`);
    expect(open.join("\n")).toBe("");
  });
});
