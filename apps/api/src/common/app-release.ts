/**
 * Which app builds this API will still talk to (2026-09-21).
 *
 * Resort Mela is not on Play or the App Store: staff download the APK
 * from the website. Nothing updates anybody, and no store enforces a
 * floor — so the floor is this API's, applied to a header the app sends
 * on every request.
 *
 * The numbers are platform settings rather than constants, for the
 * reason every commercial term here is: raising the floor is a decision
 * the owner makes on a Tuesday when a bug is found, and it must not
 * wait for a deploy. The rule they feed is `appStanding` in
 * `@rh/shared`, which the phone runs against the same two numbers — one
 * rule, so the screen and the server cannot disagree about whether
 * somebody is locked out.
 */
import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import {
  APP_PLATFORM_HEADER,
  APP_VERSION_HEADER,
  appStanding,
  mustUpdateMessage,
  UPGRADE_REQUIRED,
  type AppRelease,
} from "@rh/shared";
import { eventLogLine } from "./observability";
import { PlatformSettingsService } from "./platform-settings.service";
import { webUrl } from "./web-url";

/**
 * Paths the floor never applies to.
 *
 * A gate that also blocks the route explaining the gate is a gate
 * nobody can get past — the blocked app has to be able to ask where the
 * new build is, and the load balancer has to be able to ask whether
 * this process is alive.
 */
const ALWAYS_OPEN = ["/app/release", "/health"];

export const isAlwaysOpen = (path: string): boolean =>
  ALWAYS_OPEN.some((p) => path === p || path.startsWith(`${p}?`));

@Injectable()
export class AppReleaseService {
  constructor(@Inject(PlatformSettingsService) private readonly settings: PlatformSettingsService) {}

  /**
   * What is on offer, and what is too old.
   *
   * `downloadUrl` falls back to the console's own `/app` page rather
   * than to a hostname in the source: the page is part of this
   * deployment, so it is wherever this deployment is. A literal here
   * would be the thing that breaks the day the platform changes domain,
   * and it would break for exactly the people who cannot update.
   */
  async current(): Promise<AppRelease> {
    const [latest, minimum, downloadUrl, apkUrl, notes] = await Promise.all([
      this.settings.str("app.latestVersion"),
      this.settings.str("app.minimumVersion"),
      this.settings.str("app.downloadUrl"),
      this.settings.str("app.apkUrl"),
      this.settings.str("app.updateNotes"),
    ]);
    return {
      latest,
      minimum,
      downloadUrl: downloadUrl.trim() || `${webUrl()}/app`,
      apkUrl: apkUrl.trim(),
      notes,
    };
  }
}

/**
 * Refuses a build below the floor, on every route at once.
 *
 * Global rather than per-controller, because "this version is too old"
 * is not a fact about one screen — and a floor applied to nineteen
 * controllers out of twenty is a floor with a door in it.
 *
 * **A caller that sends no version is let through.** That is the
 * console, a smoke script, and any phone built before the header
 * existed; refusing all three to catch the third would take the console
 * down with it. The header is what identifies an app, and only an app
 * that identifies itself can be judged.
 */
@Injectable()
export class AppVersionGuard implements CanActivate {
  constructor(@Inject(AppReleaseService) private readonly release: AppReleaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    if (isAlwaysOpen(req.path)) return true;

    const version = req.header(APP_VERSION_HEADER);
    if (!version) return true;

    const release = await this.release.current();
    if (appStanding(version, release) !== "blocked") return true;

    /**
     * Status and sentence, and nothing else.
     *
     * `AllExceptionsFilter` renders a tagged error through `errorBody`,
     * which keeps `statusCode`, `message` and `requestId` and drops
     * anything else — so a `release` attached here would arrive
     * nowhere. The app keys off the 426 itself, which no other route
     * returns, and asks `/app/release` for the address. One extra
     * request, in the one case that is terminal anyway.
     */
    console.warn(
      eventLogLine("warn", "app.blocked", {
        version,
        platform: req.header(APP_PLATFORM_HEADER) ?? null,
        minimum: release.minimum,
        path: req.path,
      }),
    );
    throw Object.assign(new Error(mustUpdateMessage(release)), { status: UPGRADE_REQUIRED });
  }
}
