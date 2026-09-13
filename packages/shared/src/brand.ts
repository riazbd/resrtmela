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
 * Reads the brand; falls back to the built-in one if the API cannot be reached.
 *
 * The address is a required argument now. It used to default to an `apiBase()`
 * that read `process.env.NEXT_PUBLIC_API_URL` — a Next build-time substitution
 * that is simply absent on a phone, where a defaulted call would have fetched
 * the developer's own laptop and then fallen back to the built-in mark without
 * anyone being told. The console keeps its convenient default in its own
 * `lib/brand.ts`, which is where knowing the environment belongs.
 *
 * `init` exists for the same reason. This used to pass `cache: "no-store"`,
 * which is how a Next server component says "do not serve me a brand the owner
 * changed ten minutes ago" — and which is not a real `fetch` option anywhere
 * else. Node's `RequestInit` has no such field (the API's typecheck is how that
 * was found) and React Native's fetch ignores it. So the caller that needs it
 * passes it, and this function stays true wherever it runs.
 */
export async function fetchBrand(apiUrl: string, init?: RequestInit): Promise<Brand> {
  try {
    const res = await fetch(`${apiUrl}/cms/brand`, init);
    if (!res.ok) return DEFAULT_BRAND;
    return brandFrom(await res.json());
  } catch {
    return DEFAULT_BRAND;
  }
}
