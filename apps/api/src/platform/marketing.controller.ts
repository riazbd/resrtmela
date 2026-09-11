import { Controller, Get, Inject, Param, Query } from "@nestjs/common";
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

  /**
   * The price list the homepage quotes — the same rows Platform → Plans edits.
   * Resort plans unless asked for the agency shelf (`?audience=AGENCY`), which
   * is what agency signup shows.
   */
  @Get("plans")
  plans(@Query("audience") audience?: string) {
    return this.platform.publicPlans(audience === "AGENCY" ? "AGENCY" : "RESORT");
  }

  /** The platform's name, icon and logo, for the pages and the browser tab. */
  @Get("brand")
  brand() {
    return this.platform.publicBrand();
  }

  /** How many agencies are verified and selling — resort onboarding shows it before asking. */
  @Get("agencies/count")
  agencies() {
    return this.platform.liveAgencyCount();
  }

  /** What a signup page shows for `?offer=` — the plan and terms it lands on. */
  @Get("offers/:code")
  offer(@Param("code") code: string) {
    return this.platform.publicOffer(code);
  }
}
