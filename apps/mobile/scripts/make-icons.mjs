/**
 * The app's icons, generated from the console's brand mark.
 *
 * Committed as a script rather than three PNGs someone drew once, because the
 * mark will change and nobody will remember which sizes existed or what the
 * Android safe zone was. Run: `node scripts/make-icons.mjs`.
 */
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(HERE, "..", "assets");
const GREEN = "#15803d";

/** The mark itself, from apps/web/public/logo-mark.svg. */
const GLYPH = `<path d="M5 22V13.6a3.4 3.4 0 0 1 6.2-1.9L16 19l4.8-7.3a3.4 3.4 0 0 1 6.2 1.9V22"
  fill="none" stroke="#fff" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"/>`;

/** Green tile plus mark — the launcher icon on anything not using adaptive icons. */
const full = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="1024" height="1024">
  <rect width="32" height="32" rx="7.5" fill="${GREEN}"/>${GLYPH}</svg>`;

/**
 * Android masks the outer third of an adaptive icon's foreground, so the mark
 * is drawn into the middle 50% of a transparent square. Filling the canvas
 * here is the classic mistake: the launcher then crops the glyph, not the
 * padding, and the icon looks broken on exactly the devices most people have.
 */
const foreground = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="1024" height="1024">
  <g transform="translate(16 16)">${GLYPH}</g></svg>`;

/** The splash mark sits on the green background set in app.json. */
const splash = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="512" height="512">
  ${GLYPH}</svg>`;

mkdirSync(ASSETS, { recursive: true });

const written = [];
for (const [name, svg] of [
  ["icon.png", full],
  ["android-icon-foreground.png", foreground],
  ["splash-icon.png", splash],
  ["favicon.png", full],
]) {
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  writeFileSync(join(ASSETS, name), png);
  written.push(`${name} (${(png.length / 1024).toFixed(1)} KB)`);
}

// the monochrome and background layers the blank template shipped are not ours
console.log(written.join("\n"));
