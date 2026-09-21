/**
 * Where the app asks what it should be running (2026-09-21).
 *
 * Open, and deliberately so: the caller is either a phone deciding
 * whether to show an update line, or a phone that has just been refused
 * with a 426 and needs to know where the new build lives. Asking either
 * of them to sign in first would be asking the locked-out to produce a
 * key — and there is nothing here but four facts the website already
 * prints on a public page.
 *
 * `isAlwaysOpen` in `app-release.ts` keeps this route outside the
 * version floor. A gate that also blocks the route explaining the gate
 * is a gate nobody gets past.
 */
import { Controller, Get, Inject } from "@nestjs/common";
import type { AppRelease } from "@rh/shared";
import { AppReleaseService } from "./app-release";

@Controller()
export class AppReleaseController {
  constructor(@Inject(AppReleaseService) private readonly release: AppReleaseService) {}

  @Get("app/release")
  current(): Promise<AppRelease> {
    return this.release.current();
  }
}
