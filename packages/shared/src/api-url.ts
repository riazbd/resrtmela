/**
 * What counts as a usable API address.
 *
 * The address itself is the host's business and cannot be shared: the console
 * reads `process.env.NEXT_PUBLIC_API_URL`, which Next substitutes at build
 * time and which does not exist on a phone, where it comes from
 * `Constants.expoConfig.extra.apiUrl`. What *is* shared is what counts as a
 * valid one — and because the caller has to pass it, a phone cannot silently
 * fall through to a localhost that is nothing but the developer's own laptop.
 */
const DEVELOPMENT_FALLBACK = "http://localhost:4000";

/**
 * Trims the trailing slash so a join cannot produce `//cms/brand`, which some
 * proxies answer and others 404 — a difference that only shows up in
 * production.
 */
export function normalizeApiUrl(raw: string | null | undefined): string {
  return raw?.replace(/\/$/, "") || DEVELOPMENT_FALLBACK;
}
