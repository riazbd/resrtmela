/**
 * Which app versions the server will still talk to (2026-09-21).
 *
 * Resort Mela is not on Play or the App Store. Staff download the APK
 * from the website, so nothing updates anybody automatically and there
 * is no store to enforce a floor. Without a rule here, a phone installed
 * once in September goes on calling this API for years — against
 * routes that have moved, with money arithmetic that has been
 * corrected since.
 *
 * So the floor is the server's, and it is a number the owner can change
 * without a deploy. Three states, and the middle one is the point:
 *
 *   - **current** — nothing to say.
 *   - **update** — a newer build exists. A line the person can dismiss:
 *     interrupting a check-in to announce a release is how people learn
 *     to dismiss everything.
 *   - **blocked** — below the floor. The app stops, because at this
 *     point the alternative is a screen that quietly does the wrong
 *     thing with somebody's money.
 *
 * `blocked` is a decision about a version, not about a person, so it is
 * taken here rather than screen by screen — and the API applies the same
 * rule to the same header, so a phone cannot simply not ask.
 */

/**
 * What the phone tells the server about itself.
 *
 * Header names, written once. The app sets them and the API reads them,
 * and a typo in either would be a floor that silently never applies —
 * the worst kind of safety rule, the one that reports success.
 */
export const APP_VERSION_HEADER = "x-app-version";
export const APP_PLATFORM_HEADER = "x-app-platform";

/** The verdict on a running app. */
export type AppStanding = "current" | "update" | "blocked";

export interface AppRelease {
  /** The newest build on offer, e.g. "0.7.0". */
  latest: string;
  /** The oldest the server will still serve. Everything below it stops. */
  minimum: string;
  /**
   * Where to send a *person* — the download page, not the file.
   *
   * A blocked phone opens this, and it must land on the page rather
   * than start a download, because sideloading needs the "allow from
   * this source" step explained. The first draft sent them straight at
   * the file and the page's own button inherited the same value, so the
   * button pointed at the page it was already on. Found by opening it.
   */
  downloadUrl: string;
  /**
   * The APK itself. What the download page's button links to.
   *
   * Empty until somebody uploads a build, and the page says so rather
   * than offering a button that goes nowhere.
   */
  apkUrl: string;
  /** What changed, shown on the update screen. Empty is fine; a lie is not. */
  notes: string;
}

/**
 * `0.10.0` is newer than `0.9.0`.
 *
 * Which is the whole reason this is not a string comparison: `"0.10.0" <
 * "0.9.0"` is true in every language with a lexicographic `<`, and the
 * bug it causes appears exactly once, at version ten, months after
 * anybody last looked at this. Missing parts count as zero, so `"1"`,
 * `"1.0"` and `"1.0.0"` are one version; anything unparsable is zero,
 * because a build that cannot say what it is is not a build to trust.
 *
 * **A pre-release is older than its release**, as semver says: a build
 * calling itself `0.7.0-beta.2` is not 0.7.0 and must not pass a floor
 * set at 0.7.0. Splitting on every dot got this backwards — `beta` read
 * as a zero and the `2` after it as a *fourth* version part, so the beta
 * compared as the newer of the two. The suffix is cut off first now and
 * only breaks a tie.
 */
export function compareVersions(a: string, b: string): number {
  /** The numeric core, and whether anything was hanging off it. */
  const split = (v: string) => {
    const [core = ""] = String(v ?? "").trim().split("-");
    return {
      parts: core.split(".").map((n) => {
        const digits = /^\d+/.exec(n.trim());
        return digits ? Number(digits[0]) : 0;
      }),
      pre: String(v ?? "").trim().includes("-"),
    };
  };
  const x = split(a);
  const y = split(b);
  for (let i = 0; i < Math.max(x.parts.length, y.parts.length); i++) {
    const d = (x.parts[i] ?? 0) - (y.parts[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  if (x.pre === y.pre) return 0;
  return x.pre ? -1 : 1;
}

/**
 * Where a running build stands against what the platform is offering.
 *
 * **An unknown version is not blocked.** A caller with no version header
 * is the console, a script, or a phone built before this rule existed —
 * and refusing all three to catch the third would take the console down
 * with it. The floor binds what it can identify; `null` is the answer
 * for what it cannot.
 */
export function appStanding(
  running: string | null | undefined,
  release: Pick<AppRelease, "latest" | "minimum">,
): AppStanding | null {
  const version = String(running ?? "").trim();
  if (!version) return null;
  if (compareVersions(version, release.minimum) < 0) return "blocked";
  if (compareVersions(version, release.latest) < 0) return "update";
  return "current";
}

/**
 * The sentence the blocked screen shows.
 *
 * Written here because the phone shows it and the API sends it in its
 * refusal, and two wordings for one situation is how a support call
 * starts with "it says something different on mine".
 */
export function mustUpdateMessage(release: Pick<AppRelease, "latest">): string {
  return `This version of Resort Mela is too old to use safely. Update to ${release.latest} to carry on.`;
}

/**
 * The status the API answers with when it refuses an old build.
 *
 * 426 rather than 401 or 403, and the difference matters to the app:
 * 401 sends somebody to the sign-in screen, which is the one thing that
 * will not help. The body carries `code` so a client never has to read
 * the prose to know what happened.
 */
export const UPGRADE_REQUIRED = 426;
export const UPGRADE_REQUIRED_CODE = "app_update_required";
