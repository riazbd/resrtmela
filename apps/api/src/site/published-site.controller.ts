import { Controller, Get, Inject, Param, Query } from "@nestjs/common";
import { PublishedSiteService } from "./published-site.service";

/**
 * A resort's own shopfront, open to the world.
 *
 * No token, no session, no cookie — the caller is a stranger with a URL, and
 * everything reachable here is written on the assumption that they are. The
 * platform's own shopfront is `/cms`; this is a customer's, which is why it is
 * not filed beside it.
 *
 * Rate-limited in `app.module.ts` alongside `auth` and `cms`: a public page
 * that runs the calendar's own availability query is the one place here worth
 * a crawler's attention.
 */
@Controller("site")
export class PublishedSiteController {
  constructor(@Inject(PublishedSiteService) private readonly site: PublishedSiteService) {}

  /**
   * The same page, for the website's own renderer: always 200, `page: null`
   * when there is nothing to draw.
   *
   * Next's data cache stores only a 200, so a page that went away and answered
   * 404 was never replaced: the old copy stayed up, for good once a restart had
   * forgotten it was stale. Declared before `:slug` so "render" is not read as
   * a resort's address (it is reserved for that reason too).
   */
  @Get("render/:slug")
  async render(@Param("slug") slug: string) {
    return { page: await this.site.resort(slug) };
  }

  /**
   * Everything a page needs to draw itself.
   *
   * 404 for every reason there is nothing to draw — no such address, not
   * published, suspended, not on a plan that includes a website. One answer,
   * because which of them it is belongs to the owner and not to the internet.
   */
  @Get(":slug")
  async resort(@Param("slug") slug: string) {
    const page = await this.site.resort(slug);
    if (!page) throw Object.assign(new Error("No such site"), { status: 404 });
    return page;
  }

  /** How many rooms of each kind are free for a stay, and from what price. */
  @Get(":slug/vacancy")
  vacancy(@Param("slug") slug: string, @Query("from") from: string, @Query("to") to: string) {
    return this.site.vacancy(slug, from, to);
  }
}
