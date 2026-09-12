/**
 * Record an APK in RELEASES.md.
 *
 * `build-apk.mjs` does this itself for local builds. On Windows the build runs
 * on EAS instead, so the receipt has to be written from the downloaded
 * artifact — and it has to be written from the *file*, not from a build log,
 * because the point of the receipt is that the APK existed and this is its
 * hash.
 *
 *   node scripts/record-apk.mjs <path-to-apk> [--source "EAS 89434ac6"]
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MOBILE = join(dirname(fileURLToPath(import.meta.url)), "..");
const apk = process.argv[2];
if (!apk || !existsSync(apk)) {
  console.error("usage: node scripts/record-apk.mjs <path-to-apk> [--source <where it was built>]");
  process.exit(1);
}

const flag = process.argv.indexOf("--source");
const source = flag > -1 ? process.argv[flag + 1] : "local";

const bytes = readFileSync(apk);
const sha = createHash("sha256").update(bytes).digest("hex");
const size = (statSync(apk).size / 1024 / 1024).toFixed(1);
const { version } = JSON.parse(readFileSync(join(MOBILE, "app.json"), "utf8")).expo;
const today = new Date().toISOString().slice(0, 10);

const file = join(MOBILE, "RELEASES.md");
if (!existsSync(file)) {
  writeFileSync(
    file,
    [
      "# Builds",
      "",
      "Every APK this project has actually produced. Written by",
      "`scripts/build-apk.mjs` or `scripts/record-apk.mjs`, from the artifact —",
      "never by hand. An empty table means the app has been written but never",
      "built, which is the state the previous mobile app died in and what",
      "`apps/web/test/the-mobile-app-is-real.spec.ts` exists to catch.",
      "",
      "| Version | Date | Size | Built on | SHA-256 |",
      "|---|---|---|---|---|",
      "",
    ].join("\n"),
  );
}

const row = `| ${version} | ${today} | ${size} MB | ${source} | sha256:${sha} |\n`;
if (readFileSync(file, "utf8").includes(sha)) {
  console.log("already recorded:", sha.slice(0, 16));
} else {
  appendFileSync(file, row);
  console.log("recorded:", row.trim());
}
