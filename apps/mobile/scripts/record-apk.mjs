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
 *
 * The version is read out of the APK with `aapt2`, not out of `app.json`:
 * by the time an artifact is recorded the manifest has usually been bumped
 * for the next build, and a receipt that names the wrong version is worth
 * less than no receipt at all.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
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
/**
 * The version comes out of the APK, never out of `app.json`.
 *
 * This read the current `app.json` until 2026-09-20, and recorded 0.2.0's
 * artifact as 0.2.1 within a minute of the version being bumped for the
 * next build — a receipt claiming a version its file does not contain,
 * which is worth less than no receipt.
 *
 * `aapt2` ships with the Android build tools; without it the caller is
 * asked rather than guessed at, for the same reason.
 */
function versionOf(file) {
  const tools = join(homedir(), "AppData", "Local", "Android", "Sdk", "build-tools");
  const exe = process.platform === "win32" ? "aapt2.exe" : "aapt2";
  let aapt = process.env.AAPT2;
  if (!aapt && existsSync(tools)) {
    const newest = readdirSync(tools).sort().pop();
    if (newest) aapt = join(tools, newest, exe);
  }
  if (!aapt || !existsSync(aapt)) {
    console.error(
      "aapt2 not found — set AAPT2 to it, or pass --version <n>. " +
        "The version has to come from the APK; app.json has already moved on by now.",
    );
    process.exit(1);
  }
  const badging = execFileSync(aapt, ["dump", "badging", file], { encoding: "utf8" });
  const name = /versionName='([^']*)'/.exec(badging)?.[1];
  const code = /versionCode='([^']*)'/.exec(badging)?.[1];
  if (!name) {
    console.error("could not read versionName out of the APK");
    process.exit(1);
  }
  return code ? `${name} (${code})` : name;
}

const told = process.argv.indexOf("--version");
const version = told > -1 ? process.argv[told + 1] : versionOf(apk);
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
