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

/** The console's address, for the WebView release 0.1.0 still carries. */
export const CONSOLE_URL = extra.consoleUrl ?? "";

/** Every address that is ours, old names included. See `src/console/url-policy.ts`. */
export const CONSOLE_URLS_OWNED = extra.consoleUrlsOwned ?? [CONSOLE_URL];
