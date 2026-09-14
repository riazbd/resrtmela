import { isSiteTemplate, type PublishedResort } from "@rh/shared";

/** The cache tag one resort's page is held under. Shared with the route that clears it. */
export const siteTag = (slug: string): string => `site:${slug}`;

/**
 * A resort's published page, fetched before it is rendered.
 *
 * Server-side and never in the browser, for the reason the front page's prices
 * moved: a brochure whose prices and rooms arrive a moment after the HTML is a
 * brochure Google never sees, and being found is most of what this page is for.
 *
 * Nothing here throws. A resort that is not published, not on a plan that
 * includes a website, or simply not there is `null`, and the page turns that
 * into a 404 — one answer for all of them, because which one it is belongs to
 * the owner.
 */
export async function fetchPublishedResort(
  apiUrl: string,
  slug: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PublishedResort | null> {
  try {
    const r = await fetchImpl(`${apiUrl}/site/${encodeURIComponent(slug)}`, {
      /**
       * Tagged, and two minutes as a floor under it.
       *
       * The tag is what the API pulls when the owner saves, so an edit shows up
       * on the next visit rather than whenever a timer happens to expire — an
       * owner who saves and sees nothing has a broken website, whatever the
       * cache thinks. The interval is for everything nobody thought of as a
       * website change: a rate edited in the panel, a room retired, a discount
       * starting. A brochure quoting yesterday's price is the support call this
       * whole design exists to avoid.
       */
      next: { revalidate: 120, tags: [siteTag(slug)] },
    } as RequestInit);
    if (!r.ok) return null;
    return drawable(await r.json());
  } catch {
    return null;
  }
}

/**
 * Whatever came back, if a page can be drawn from it.
 *
 * Checked rather than asserted. The front page learned this the expensive way:
 * `Array.isArray(v)` claimed a type while verifying nothing, and the first row
 * that did not match threw during a static render and took the whole page down
 * on a deploy. A resort's own site failing that way would be worse — it is the
 * front of somebody's business, and they would hear about it before we did.
 */
function drawable(v: unknown): PublishedResort | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Partial<PublishedResort>;
  if (typeof r.slug !== "string" || typeof r.name !== "string") return null;
  if (!Array.isArray(r.roomTypes)) return null;
  if (!r.roomTypes.every((t) => t && typeof t.key === "string" && typeof t.name === "string")) {
    return null;
  }
  if (!Array.isArray(r.photos)) return null;
  return {
    ...(r as PublishedResort),
    // a retired template name must not decide whether the page renders; the
    // registry falls back, and this keeps the type honest on the way in
    template: isSiteTemplate(r.template) ? r.template : "sanctuary",
  };
}
