import { Injectable, Logger } from "@nestjs/common";

/**
 * Telling the website that a resort's page is out of date.
 *
 * The page is cached, because a brochure that queries the database on every
 * visit falls over the day somebody shares it. An owner who saves and sees
 * nothing change has, as far as they are concerned, a broken website — so the
 * editor says so here and the page is rebuilt on the next visit.
 *
 * **Nothing here may fail a save.** The owner's change is already in the
 * database; a website that is briefly stale is a worse outcome than an error
 * message on a save that actually worked, so every failure is a log line and
 * the two-minute interval in `site-data.ts` is the floor under it.
 */
@Injectable()
export class SiteCacheService {
  private readonly logger = new Logger(SiteCacheService.name);

  async changed(slug: string): Promise<void> {
    const base = process.env.WEB_URL;
    const secret = process.env.REVALIDATE_SECRET;
    // not configured is a normal state in development and in tests, and is not
    // worth a line in the log every time somebody types in the editor
    if (!base || !secret) return;

    try {
      const res = await fetch(`${base.replace(/\/+$/, "")}/api/site/revalidate`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-revalidate-secret": secret },
        body: JSON.stringify({ slug }),
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) this.logger.warn(`site cache for "${slug}": the website answered ${res.status}`);
    } catch (e) {
      this.logger.warn(`site cache for "${slug}": ${(e as Error).message}`);
    }
  }
}
