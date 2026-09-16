import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { AgencyPublished } from "@rh/shared";
import { API_URL } from "@/lib/api-url";
import { AgencyPage } from "@/components/agency-site/agency-page";
import { fetchAgencyPage } from "./agency-data";

/**
 * An agency's own front door (2026-09-17 design, §1).
 *
 * Rendered on the server from the published view, like a resort's, so the
 * tours, the resorts and the words are in the HTML a search engine reads.
 */

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const page = await fetchAgencyPage(API_URL, slug);
  if (!page) return { title: "Not found" };
  const { agency } = page;
  const description =
    agency.headline ?? agency.intro?.slice(0, 160) ?? `Tours and stays with ${agency.name}.`;
  const image = agency.photos[0]?.url;
  return {
    // the agency's own name and nothing of ours: this is their front door
    title: { absolute: agency.name },
    description,
    alternates: { canonical: `/a/${agency.slug}` },
    openGraph: { title: agency.name, description, type: "website", ...(image ? { images: [{ url: image }] } : {}) },
    twitter: { card: image ? "summary_large_image" : "summary", title: agency.name, description },
  };
}

/** `schema.org/TravelAgency`, with only what is actually known. */
function structuredData(page: AgencyPublished) {
  const { agency } = page;
  return {
    "@context": "https://schema.org",
    "@type": "TravelAgency",
    name: agency.name,
    ...(agency.headline || agency.intro ? { description: agency.headline ?? agency.intro } : {}),
    ...(agency.photos.length ? { image: agency.photos.map((p) => p.url) } : {}),
    ...(agency.phone ? { telephone: agency.phone } : {}),
    ...(agency.email ? { email: agency.email } : {}),
    ...(agency.address ? { address: { "@type": "PostalAddress", streetAddress: agency.address } } : {}),
    ...(agency.social.facebook || agency.social.instagram
      ? { sameAs: [agency.social.facebook, agency.social.instagram].filter(Boolean) }
      : {}),
  };
}

export default async function AgencySitePage({ params }: Params) {
  const { slug } = await params;
  const page = await fetchAgencyPage(API_URL, slug);
  if (!page) notFound();
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData(page)).replace(/</g, "\\u003c") }}
      />
      <AgencyPage page={page} />
    </>
  );
}
