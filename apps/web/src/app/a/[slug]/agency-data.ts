import type { AgencyPublished } from "@rh/shared";

/** The cache tag one agency's page is held under. Shared with the route that clears it. */
export const agencyTag = (slug: string): string => `agency:${slug}`;

/**
 * An agency's published page, fetched on the server before it renders — the
 * same reasons as a resort's (`r/[slug]/site-data.ts`): what is not in the HTML
 * is not found.
 *
 * Nothing here throws. Anything that is not a drawable page is `null`, and the
 * page turns that into a 404.
 */
export async function fetchAgencyPage(
  apiUrl: string,
  slug: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AgencyPublished | null> {
  try {
    // always 200, `page: null` when not live — see `r/[slug]/site-data.ts`
    const r = await fetchImpl(`${apiUrl}/site/agency/render/${encodeURIComponent(slug)}`, {
      /**
       * Tagged, so the agency's own edits show on the next visit; two minutes
       * as a floor, because the resorts and prices on the page change in the
       * resorts' panels, which do not know this page exists.
       */
      next: { revalidate: 120, tags: [agencyTag(slug)] },
    } as RequestInit);
    if (!r.ok) return null;
    return drawable(((await r.json()) as { page?: unknown } | null)?.page);
  } catch {
    return null;
  }
}

/** Whatever came back, if a page can be drawn from it — checked, not asserted. */
export function drawable(v: unknown): AgencyPublished | null {
  if (!v || typeof v !== "object") return null;
  const page = v as Partial<AgencyPublished>;
  const agency = page.agency as Partial<AgencyPublished["agency"]> | undefined;
  if (!agency || typeof agency.name !== "string" || typeof agency.slug !== "string") return null;
  if (!Array.isArray(agency.photos) || !Array.isArray(page.resorts) || !Array.isArray(page.tours)) return null;
  if (!page.resorts.every((r) => r && typeof r.slug === "string" && Array.isArray(r.roomTypes) && Array.isArray(r.photos))) {
    return null;
  }
  if (!page.tours.every((t) => t && typeof t.name === "string" && typeof t.price === "number")) return null;
  return page as AgencyPublished;
}
