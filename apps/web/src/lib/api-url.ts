/**
 * Where the API is — usable from a server component as well as the browser.
 *
 * This lived in `lib/api.ts`, which is a `"use client"` module because it
 * reaches for `localStorage` and `window.location`. A server component that
 * imported the address therefore pulled a client module into a server render
 * and returned a 500 for the whole front page. The address itself is nothing
 * but an environment variable, so it belongs somewhere either side can read.
 *
 * The *shape* of a valid address is shared — `normalizeApiUrl` — but reading
 * `process.env.NEXT_PUBLIC_API_URL` cannot be: Next substitutes it at build
 * time and a phone has no such thing. Knowing the environment is the host's
 * job, which is why that half stayed here.
 */
import { normalizeApiUrl } from "@rh/shared";

export const API_URL = normalizeApiUrl(process.env.NEXT_PUBLIC_API_URL);
