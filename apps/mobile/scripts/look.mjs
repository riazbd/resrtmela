#!/usr/bin/env node
/**
 * Open a screen of the app in a browser and take its picture.
 *
 * The app ships on Android; this is not that. It is the lens used while a
 * screen is being written, because the one emulator this build machine can
 * run wants 2GB it does not have — the last attempt died with "JavaScript
 * heap out of memory" and 214MB free. A browser tab costs a fraction of
 * that, and Expo renders the same components through react-native-web.
 *
 * What it does NOT prove: shadows, the keyboard, safe areas, and anything
 * native. A phone over adb is the truth, and `device.mjs` is for that.
 *
 *   pnpm -F @rh/mobile web                 Metro, in one terminal
 *   node scripts/look.mjs /login shot.png  open that route, save the picture
 *
 * `--type`, `--tap` and `--wait` drive it far enough to reach the screen
 * behind a sign-in. Several of each are separated by `;`.
 */
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";

const SCRATCH = process.env.RM_SCRATCH ?? "";
const require_ = createRequire(
  SCRATCH ? `${SCRATCH}/x.js` : import.meta.url,
);

/**
 * playwright-core lives in the session scratchpad rather than in this
 * package: it is a tool for looking, not a dependency of the app, and
 * putting it in package.json would ship a browser driver to every
 * developer who only wants to run the tests.
 */
let chromium;
try {
  ({ chromium } = require_("playwright-core"));
} catch {
  console.error(
    "playwright-core is not installed.\n" +
      "  npm i playwright-core   (in a scratch directory)\n" +
      "  RM_SCRATCH=<that directory> node scripts/look.mjs …",
  );
  process.exit(1);
}

const EDGE =
  process.env.RM_BROWSER ??
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE = process.env.RM_WEB_URL ?? "http://127.0.0.1:8082";

const args = process.argv.slice(2);
const flags = new Map();
const positional = [];
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith("--")) flags.set(args[i].slice(2), args[++i]);
  else positional.push(args[i]);
}
const route = positional[0] ?? "/";
const out = resolve(positional[1] ?? "screen.png");

/** A phone-shaped window, so a layout meant for one is judged as one. */
const VIEWPORT = { width: 412, height: 915 };

/**
 * Same-origin checking off, in this throwaway browser and nowhere else.
 *
 * A phone sends no `Origin` header, so the app never meets CORS; a browser
 * does, and the API's allow-list is the console's domains — correctly, and
 * it is not going to be widened so that a development lens can look through
 * it. The looser setting belongs on the looking glass, not on the door.
 *
 * Chromium only honours this with a profile directory of its own, which is
 * why the context is persistent and disposable.
 */
const PROFILE = process.env.RM_PROFILE ?? `${SCRATCH || "."}/look-profile`;
mkdirSync(PROFILE, { recursive: true });
const context = await chromium.launchPersistentContext(PROFILE, {
  executablePath: EDGE,
  headless: true,
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  args: ["--disable-web-security", "--disable-site-isolation-trials"],
});
const browser = context.browser() ?? { close: () => context.close() };
const page = context.pages()[0] ?? (await context.newPage());

const problems = [];
page.on("pageerror", (e) => problems.push(`pageerror: ${String(e.message).slice(0, 160)}`));
page.on("console", (m) => {
  if (m.type() === "error") problems.push(`console: ${m.text().slice(0, 160)}`);
});
page.on("response", (r) => {
  if (r.status() >= 400 && !r.url().includes("favicon")) {
    problems.push(`${r.status()} ${r.url().slice(-70)}`);
  }
});

/**
 * `domcontentloaded`, not `networkidle`: Expo's dev server holds a websocket
 * open for hot reload, so the network is never idle and the wait never ends.
 * What is waited for instead is the app having drawn something.
 */
await page.goto(BASE + route, { waitUntil: "domcontentloaded" });
await page
  .locator("body")
  .filter({ hasText: /\S/ })
  .first()
  .waitFor({ timeout: 60_000 })
  .catch(() => problems.push("the app drew nothing within 60s"));

/**
 * --type "label=value;label=value" — fills boxes by the label a person reads.
 *
 * `exact: true`, which is not fussiness: the default is a case-insensitive
 * substring, so "Password" also matches the "Forgot password?" button and
 * the locator waits for a page that can never satisfy it. Separated by `;`
 * because an email address is allowed a comma far more often than a
 * semicolon.
 */
if (flags.has("type")) {
  for (const pair of flags.get("type").split(";")) {
    const [label, ...rest] = pair.split("=");
    await page.getByLabel(label.trim(), { exact: true }).fill(rest.join("="));
  }
}
// --tap "Sign in;Save" — presses by the words on it, exactly
if (flags.has("tap")) {
  for (const name of flags.get("tap").split(";")) {
    await page
      .getByRole("button", { name: name.trim(), exact: true })
      .first()
      .click();
  }
}
await page.waitForTimeout(Number(flags.get("wait") ?? 1500));

mkdirSync(dirname(out), { recursive: true });
await page.screenshot({ path: out, fullPage: false });

// what is actually on the screen, so a run says something without the picture
const words = (await page.locator("body").innerText())
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean)
  .slice(0, 25);
console.log(`route   : ${route}`);
console.log(`reads   : ${words.join(" | ")}`);
console.log(`problems: ${problems.length ? problems.join(" | ") : "none"}`);
console.log(`picture : ${out}`);
if (!existsSync(out)) process.exitCode = 1;

await context.close();
await browser.close?.();
