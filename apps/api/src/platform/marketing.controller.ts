import { Controller, Get, Inject } from "@nestjs/common";
import { PlatformService } from "./platform.service";

/**
 * This platform's own shopfront — not a customer's.
 *
 * It used to sit in `public-api.controller.ts` beside the resort-website API,
 * two things sharing the word "public" and nothing else. That is how a file
 * comes to hold both a door being closed and the pricing page that sells the
 * product; see the 2026-09-11 design, section 4.2.
 */
@Controller("cms")
export class MarketingController {
  constructor(@Inject(PlatformService) private readonly platform: PlatformService) {}

  @Get()
  all() {
    return this.platform.publicCms();
  }

  /** The price list the homepage quotes — the same rows Platform → Plans edits. */
  @Get("plans")
  plans() {
    return this.platform.publicPlans();
  }
}
