/**
 * The platform's own brand, as the console wears it.
 *
 * Name, icon and logo are CMS rows the owner sets in Platform → Website CMS,
 * so renaming the platform or changing its favicon is a save and a reload, not
 * a deploy. Nothing is set to begin with, and then the built-in mark shows.
 */

export interface Brand {
  name: string;
  /** a square image for the tile and the browser tab */
  icon: string | null;
  /** a wide image used instead of the whole lockup */
  logo: string | null;
}

export const DEFAULT_BRAND: Brand = { name: "Resort Mela", icon: null, logo: null };

/**
 * What `/cms/brand` sent, made safe to render.
 *
 * Only an inline image or an https link is kept. A `javascript:` or `blob:`
 * value is dropped rather than handed to an `<img>`, because this row is
 * written by a human in a form and read by every page.
 */
export function brandFrom(raw: unknown): Brand {
  const r = (raw ?? {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const src = (v: unknown) => {
    const s = text(v);
    return s && (/^data:image\//i.test(s) || /^https?:\/\//i.test(s)) ? s : null;
  };
  return { name: text(r.name) ?? DEFAULT_BRAND.name, icon: src(r.icon), logo: src(r.logo) };
}

/**
 * Where the API is, read here rather than imported from `lib/api`.
 *
 * That module is `"use client"`, and a server component importing a value out
 * of a client module gets a reference to it, not the value — so the base URL
 * arrived as a function and every server-side read of the brand quietly fell
 * back to the default.
 */
export function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:4000";
}

/** Reads the brand; falls back to the built-in one if the API cannot be reached. */
export async function fetchBrand(apiUrl: string = apiBase()): Promise<Brand> {
  try {
    const res = await fetch(`${apiUrl}/cms/brand`, { cache: "no-store" });
    if (!res.ok) return DEFAULT_BRAND;
    return brandFrom(await res.json());
  } catch {
    return DEFAULT_BRAND;
  }
}
