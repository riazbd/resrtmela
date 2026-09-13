/**
 * Moved to `@rh/shared` so the mobile app wears the same brand.
 *
 * `apiBase` and the one-argument `fetchBrand` stayed behind, because both are
 * about knowing the environment rather than about the brand. The shared
 * `fetchBrand` requires an address; this wrapper supplies the console's.
 */
import { fetchBrand as fetchBrandFrom, normalizeApiUrl, type Brand } from "@rh/shared";

export { type Brand, DEFAULT_BRAND, brandFrom } from "@rh/shared";

/**
 * Where the API is, read here rather than imported from `lib/api`.
 *
 * That module is `"use client"`, and a server component importing a value out
 * of a client module gets a reference to it, not the value — so the base URL
 * arrived as a function and every server-side read of the brand quietly fell
 * back to the default.
 */
export function apiBase(): string {
  return normalizeApiUrl(process.env.NEXT_PUBLIC_API_URL);
}

/**
 * Reads the brand; falls back to the built-in one if the API cannot be reached.
 *
 * `cache: "no-store"` is passed here rather than inside the shared function
 * because it is Next's word, not fetch's: it tells a server component not to
 * serve a brand the owner changed after the last render. Node has no such
 * option and React Native ignores it.
 */
export function fetchBrand(apiUrl: string = apiBase()): Promise<Brand> {
  return fetchBrandFrom(apiUrl, { cache: "no-store" });
}
