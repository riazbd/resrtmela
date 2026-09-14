import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { PublishedResort } from "@rh/shared";
import { API_URL } from "@/lib/api-url";
import { templateFor } from "@/components/site/templates";
import { fetchPublishedResort } from "./site-data";

/**
 * A resort's own front door (2026-09-14 design, §5).
 *
 * Rendered on the server from the published view, so the prices, the rooms and
 * the words are in the HTML itself. For most of these resorts this page will be
 * the first time they are indexed at all, and a search engine that has to run
 * JavaScript to find a price mostly does not bother.
 */

type Params = { params: Promise<{ slug: string }> };

/**
 * What a search result and a shared link will say.
 *
 * Built from the owner's own words rather than a template sentence: a
 * description that reads like every other resort's is a description Google has
 * no reason to show.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const resort = await fetchPublishedResort(API_URL, slug);
  if (!resort) return { title: "Not found" };

  const title = resort.location ? `${resort.name} — ${resort.location}` : resort.name;
  const description =
    resort.headline ?? resort.intro?.slice(0, 160) ?? `Rooms and rates at ${resort.name}.`;
  const image = resort.photos[0]?.url;

  return {
    /**
     * Absolute: the root layout appends the platform's name to every title, and
     * this page is not the platform's. A resort's own tab says the resort's own
     * name and stops — putting our brand on their front door would be putting
     * our brand on their front door.
     */
    title: { absolute: title },
    description,
    alternates: { canonical: `/r/${resort.slug}` },
    openGraph: {
      title,
      description,
      type: "website",
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: { card: image ? "summary_large_image" : "summary", title, description },
  };
}

/**
 * The same facts again, in the form a search engine reads.
 *
 * `schema.org/Hotel` is what lets a result carry a photograph and a price
 * instead of a blue line of text, and it is the cheapest advantage this page
 * can give a resort. Only what is actually known is emitted — an empty field is
 * worse than an absent one, because it says "we have no price" rather than
 * nothing at all.
 */
function structuredData(resort: PublishedResort) {
  const priced = resort.roomTypes.filter((t) => t.priceFrom != null);
  return {
    "@context": "https://schema.org",
    "@type": "Hotel",
    name: resort.name,
    ...(resort.headline || resort.intro ? { description: resort.headline ?? resort.intro } : {}),
    ...(resort.photos.length ? { image: resort.photos.map((p) => p.url) } : {}),
    ...(resort.contactPhone ? { telephone: resort.contactPhone } : {}),
    ...(resort.address || resort.location
      ? {
          address: {
            "@type": "PostalAddress",
            ...(resort.address ? { streetAddress: resort.address } : {}),
            ...(resort.location ? { addressLocality: resort.location } : {}),
          },
        }
      : {}),
    ...(resort.map
      ? { geo: { "@type": "GeoCoordinates", latitude: resort.map.lat, longitude: resort.map.lng } }
      : {}),
    ...(resort.amenities.length
      ? {
          amenityFeature: resort.amenities.map((a) => ({
            "@type": "LocationFeatureSpecification",
            name: a,
          })),
        }
      : {}),
    ...(priced.length
      ? {
          priceRange: `${Math.min(...priced.map((t) => t.priceFrom!))}–${Math.max(
            ...priced.map((t) => t.priceFrom!),
          )} ${resort.currency}`,
          makesOffer: priced.map((t) => ({
            "@type": "Offer",
            name: t.name,
            price: t.priceFrom,
            priceCurrency: resort.currency,
          })),
        }
      : {}),
  };
}

export default async function ResortSitePage({ params }: Params) {
  const { slug } = await params;
  const resort = await fetchPublishedResort(API_URL, slug);
  if (!resort) notFound();

  const Template = templateFor(resort.template);
  return (
    <>
      <script
        type="application/ld+json"
        // the object is built here from typed fields, not from anything a
        // visitor sent; the escape keeps a `</script>` in an owner's own prose
        // from ending the block early
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData(resort)).replace(/</g, "\\u003c"),
        }}
      />
      <Template resort={resort} />
    </>
  );
}
