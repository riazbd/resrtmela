/**
 * The addresses this build talks to.
 *
 * Read from `app.json`'s `extra`, never written here. The platform moved
 * domain on 2026-09-19 and the shipped 0.1.0 build still points at the old
 * host — an app that has baked an address into its source cannot be told
 * about a move without a store release, which is why `@rh/shared`'s
 * `normalizeApiUrl` takes the value as an argument rather than reading an
 * environment it cannot see.
 */
import Constants from "expo-constants";
import { normalizeApiUrl } from "@rh/shared";

interface Extra {
  apiUrl?: string;
  consoleUrl?: string;
  consoleUrlsOwned?: string[];
}

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

/**
 * Where the API is. Trailing slash trimmed, so a join cannot double it.
 *
 * `EXPO_PUBLIC_API_URL` wins when it is set, which is how a screen is opened
 * against a local API with seeded data instead of against the live one. Expo
 * inlines `EXPO_PUBLIC_*` at bundle time, so it cannot be changed after a
 * build and cannot become a way of pointing a shipped app somewhere else.
 */
export const API_URL = normalizeApiUrl(process.env.EXPO_PUBLIC_API_URL || extra.apiUrl);

/**
 * What this build calls itself, sent on every request.
 *
 * From `app.json`'s `version`, never a literal: the whole point is
 * that the server can tell an old build apart from a new one, and a
 * number typed in a second place is a number that will one day disagree
 * with the one in the manifest.
 *
 * Empty when the manifest has no version — a development client, or a
 * bundle loaded outside Expo. `appStanding` treats an unknown version
 * as "no verdict" rather than "too old", so a developer is never
 * locked out by their own floor.
 */
export const APP_VERSION = Constants.expoConfig?.version ?? "";

/**
 * The console's address.
 *
 * It carried the WebView until phase 4 deleted it — releases 0.1.0
 * through 0.5.0 shipped a browser pointed here, and every screen the app
 * did not have yet was that browser. The URL stays because the app still
 * sends people to the desk for the handful of things that belong on a
 * wide screen: an import, a role's thirty checkboxes, writing a quote.
 */
export const CONSOLE_URL = extra.consoleUrl ?? "";
