/**
 * What a resort publishes about itself (2026-09-14 design).
 *
 * The vocabulary and the pure rules, here rather than in either face, because
 * the site renders this and `/v1` will serve it. A price that two modules
 * compute is a price with two answers.
 */

/**
 * The finished layouts a resort may choose between.
 *
 * A closed list the code declares, exactly like `PLAN_FEATURES`: each key is a
 * component somebody designed, so a key nobody wrote renders nothing at all.
 * Adding one is a developer's job — which is the point, because what is on
 * offer here is a finished site and not a starting point.
 *
 * They differ in layout, typography and how they open, never in what they are
 * given: every one of them takes the same published view and nothing else. That
 * is what lets a resort change template without losing a word it wrote.
 */
export const SITE_TEMPLATES = [
  {
    key: "sanctuary",
    label: "Sanctuary",
    blurb: "A full-width photograph, quiet type, and the rooms in a calm column",
  },
  {
    key: "verandah",
    label: "Verandah",
    blurb: "Warm and traditional — a framed cover, the rooms side by side",
  },
  {
    key: "ledger",
    label: "Ledger",
    blurb: "Plain and quick: prices and availability first, pictures after",
  },
] as const;

export type SiteTemplate = (typeof SITE_TEMPLATES)[number]["key"];

const TEMPLATE_KEYS = new Set<string>(SITE_TEMPLATES.map((t) => t.key));

export function isSiteTemplate(value: unknown): value is SiteTemplate {
  return typeof value === "string" && TEMPLATE_KEYS.has(value);
}

/** The column's own limit, so a slug can never be written that will not fit. */
export const SLUG_MAX = 80;

/**
 * A name turned into an address.
 *
 * Deliberately ASCII-only. A Bangla resort name has no ASCII to keep, and a
 * percent-encoded Bengali URL is neither readable nor typeable — so such a name
 * falls back and the owner picks the address they want. Guessing a
 * transliteration would put a spelling nobody chose on the front of somebody's
 * business.
 */
/**
 * Addresses a resort may not have. `agency` is where agencies' pages live
 * (`/site/agency/<slug>`); a resort by that name would make
 * `/site/agency/vacancy` mean two different pages.
 */
export const RESERVED_RESORT_SLUGS: readonly string[] = ["agency"];

export function siteSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    // a cut can land on a dash
    .replace(/-+$/g, "");
  return slug || "resort";
}

/**
 * The handle each room type is known by on a public page, in the order given.
 *
 * Positional so the caller can zip them back onto its own rows. They are what
 * an anchor links to and what an availability count is matched against, which
 * is why a room type needs a public handle at all: its database id is nobody's
 * business outside the panel.
 *
 * Two room types called "Deluxe" is an ordinary state — one resort here has
 * nine rooms across two types with the same word in both — so the duplicate is
 * numbered rather than refused. The number is checked against the keys already
 * taken, so a resort with "Deluxe", "Deluxe 2" and another "Deluxe" does not
 * end up with two `deluxe-2`s pointing at different rooms.
 */
export function roomTypeKeys(names: readonly string[]): string[] {
  const taken = new Set<string>();
  return names.map((name) => {
    const base = siteSlug(name).replace(/^resort$/, "room");
    let key = base;
    let n = 1;
    while (taken.has(key)) {
      n += 1;
      key = `${base}-${n}`;
    }
    taken.add(key);
    return key;
  });
}

/** One photograph, as a page draws it. */
export interface PublishedPhoto {
  url: string;
  alt: string | null;
  width: number | null;
  height: number | null;
}

/** A kind of room, as a stranger may see it. */
export interface PublishedRoomType {
  /** `roomTypeKeys` — an anchor and a handle, never an id */
  key: string;
  name: string;
  sleeps: { adults: number; children: number };
  amenities: string[];
  photos: PublishedPhoto[];
  /**
   * The lowest a night of this kind costs today, discounts already taken off —
   * the same number the panel quotes. `null` when the resort has no sellable
   * room of this kind, which a page shows as "ask us" rather than as free.
   */
  priceFrom: number | null;
}

/** Everything a published page is allowed to know. */
export interface PublishedResort {
  slug: string;
  name: string;
  location: string | null;
  address: string | null;
  contactPhone: string | null;
  whatsapp: string | null;
  headline: string | null;
  intro: string | null;
  amenities: string[];
  template: SiteTemplate;
  themeColor: string | null;
  map: { lat: number; lng: number } | null;
  social: { facebook: string | null; instagram: string | null };
  currency: string;
  locale: string;
  checkInTime: string;
  checkOutTime: string;
  photos: PublishedPhoto[];
  roomTypes: PublishedRoomType[];
}

/**
 * How many rooms of a kind are free for a whole stay.
 *
 * A count, never a room. "3 Deluxe free" is a fact about inventory; which
 * particular room, and why it came free, is somebody's private business.
 */
export interface PublishedVacancy {
  key: string;
  free: number;
  /** the lowest nightly rate among the rooms that are actually free */
  priceFrom: number | null;
}

// ─────────────────────────── an agency's front door ───────────────────────────

/**
 * A resort, as an agency that sells it may show it (2026-09-17 design, §1).
 *
 * The resort's own published view, with two differences: a price appears only
 * where the resort shares its rates with agents, and `bookableUntil` says how far
 * ahead the resort lets agencies book.
 */
export interface AgencyResort {
  slug: string;
  name: string;
  location: string | null;
  currency: string;
  locale: string;
  checkInTime: string;
  checkOutTime: string;
  photos: PublishedPhoto[];
  roomTypes: PublishedRoomType[];
  /** the last check-out date (YYYY-MM-DD) an agency may book; null is no limit */
  bookableUntil: string | null;
}

/** A tour package, as a stranger may see it: no cost lines, one price. */
export interface AgencyTour {
  id: number;
  name: string;
  summary: string | null;
  days: number;
  nights: number;
  /** how many people the price covers */
  pax: number;
  price: number;
}

/** Everything an agency's page, or its API, is allowed to say. */
export interface AgencyPublished {
  agency: {
    slug: string;
    name: string;
    headline: string | null;
    intro: string | null;
    phone: string | null;
    email: string | null;
    whatsapp: string | null;
    address: string | null;
    themeColor: string | null;
    social: { facebook: string | null; instagram: string | null };
    photos: PublishedPhoto[];
  };
  resorts: AgencyResort[];
  tours: AgencyTour[];
}
