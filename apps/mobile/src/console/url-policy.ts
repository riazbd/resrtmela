/**
 * Where a navigation goes: stay in the WebView, hand it to the phone, or drop
 * it on the floor.
 *
 * Written as a pure function with no React Native imports so it can be tested
 * without a device — the alternative is discovering on someone's phone that a
 * guest's `tel:` link showed a "page cannot be displayed" error.
 */
export type Route = "inside" | "outside" | "blocked";

/** Schemes the phone owns. Tapping one should leave the app. */
const HANDED_TO_THE_PHONE = new Set([
  "tel:",
  "mailto:",
  "sms:",
  "whatsapp:",
  "intent:",
  "geo:",
  "market:",
]);

/**
 * `javascript:` in particular: a link that executes in our WebView, where the
 * session token lives. Nothing that is not a document gets to navigate.
 */
const NEVER = new Set(["javascript:", "data:", "file:", "blob:"]);

export function routeFor(url: string, consoleUrl: string): Route {
  if (!url) return "blocked";
  if (url === "about:blank") return "inside";

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return "blocked";
  }

  if (NEVER.has(target.protocol)) return "blocked";
  if (HANDED_TO_THE_PHONE.has(target.protocol)) return "outside";
  if (target.protocol !== "https:") return "outside";

  /**
   * Compared as a whole origin, never as a suffix. `endsWith` would accept
   * `resortmela.rootcodebd.com.attacker.net`, which is a different site that
   * would then be running inside our WebView, under our icon, next to our
   * session.
   */
  return target.origin === new URL(consoleUrl).origin ? "inside" : "outside";
}
