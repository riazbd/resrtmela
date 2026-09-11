/**
 * The platform's own brand — its name, its icon, its logo.
 *
 * These are CMS rows, not files in the repository, because the owner must be
 * able to change what their platform is called and what it looks like without
 * a deploy. The built-in mark is only what shows when they have set nothing.
 *
 * An image arrives as a `data:` URL (the console reads the file the owner
 * picked and sends its bytes) or as a link to one already on the web. Both are
 * rendered through an `<img>` and never inlined into the page, so an SVG
 * cannot bring a script with it — and the check below refuses one that tries
 * anyway, because the same row may be read by something else later.
 */

export const BRAND_KEYS = ["brand.name", "brand.icon", "brand.logo"] as const;
export type BrandKey = (typeof BRAND_KEYS)[number];

/** Bytes of the stored value, not of the image: base64 is about a third larger. */
export const BRAND_LIMIT: Record<BrandKey, number> = {
  "brand.name": 60,
  // a favicon is a small square; 96KB of base64 is roughly a 70KB image
  "brand.icon": 96 * 1024,
  "brand.logo": 256 * 1024,
};

const IMAGE_TYPES = [
  "image/svg+xml",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/x-icon",
  "image/vnd.microsoft.icon",
];

/** Markup that would run if the file were ever inlined instead of shown in an <img>. */
const SVG_DANGER = /<script|javascript:|\son\w+\s*=/i;
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

const bad = (message: string) => Object.assign(new Error(message), { status: 400 });

export function isBrandKey(key: string): key is BrandKey {
  return (BRAND_KEYS as readonly string[]).includes(key);
}

/** Throws unless `value` is something this key may hold. An empty value clears it. */
export function assertBrandValue(key: BrandKey, value: string): void {
  const v = value.trim();
  if (v === "") return;
  if (v.length > BRAND_LIMIT[key]) {
    const kb = Math.round(BRAND_LIMIT[key] / 1024);
    throw bad(
      key === "brand.name"
        ? `The name can be at most ${BRAND_LIMIT[key]} characters.`
        : `That file is too large — the limit is about ${kb}KB. Save it smaller, or use an SVG.`,
    );
  }
  if (key === "brand.name") {
    if (CONTROL_CHARS.test(v)) throw bad("The name cannot contain control characters.");
    return;
  }

  if (/^https?:\/\//i.test(v)) return;
  const m = /^data:([a-z0-9.+/-]+);base64,([a-z0-9+/=]+)$/i.exec(v);
  if (!m) throw bad("That is not an image. Upload a file, or paste a link starting with https://");
  const type = m[1]!.toLowerCase();
  if (!IMAGE_TYPES.includes(type)) {
    throw bad(`${type} is not an image this can show. Use SVG, PNG, JPEG or WebP.`);
  }
  const decoded = Buffer.from(m[2]!, "base64");
  if (decoded.length === 0) throw bad("That image is empty.");
  if (type === "image/svg+xml" && SVG_DANGER.test(decoded.toString("utf8"))) {
    throw bad("That SVG carries a script. Export it again without one.");
  }
}
