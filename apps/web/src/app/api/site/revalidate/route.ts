import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { siteTag } from "@/app/r/[slug]/site-data";
import { agencyTag } from "@/app/a/[slug]/agency-data";

/**
 * "This resort's page is out of date."
 *
 * A published page is cached, because a brochure that queries the database on
 * every visit is a brochure that falls over the day somebody shares it. But an
 * owner who saves a change and sees nothing happen has, as far as they are
 * concerned, a broken website — so the API calls this the moment anything they
 * edited changes, and the page is rebuilt on the next visit.
 *
 * The secret is shared with the API and nothing else. Without it this is a
 * button anybody on the internet can press to make every page rebuild, which
 * is a denial-of-service with a polite name.
 */
export async function POST(req: Request) {
  const expected = process.env.REVALIDATE_SECRET;
  // an unset secret must refuse rather than wave everything through: a
  // deployment that forgot to set it should lose cache invalidation, not its
  // front door
  if (!expected || req.headers.get("x-revalidate-secret") !== expected) {
    return NextResponse.json({ revalidated: false }, { status: 404 });
  }

  const body: unknown = await req.json().catch(() => null);
  const slug = (body as { slug?: unknown } | null)?.slug;
  // an agency's page is the same route with its own key (2026-09-17)
  const agency = (body as { agency?: unknown } | null)?.agency;
  if (typeof agency === "string" && agency !== "") {
    revalidateTag(agencyTag(agency));
    return NextResponse.json({ revalidated: true });
  }
  if (typeof slug !== "string" || slug === "") {
    return NextResponse.json({ revalidated: false }, { status: 400 });
  }

  revalidateTag(siteTag(slug));
  return NextResponse.json({ revalidated: true });
}
