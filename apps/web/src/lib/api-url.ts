/**
 * Where the API is — usable from a server component as well as the browser.
 *
 * This lived in `lib/api.ts`, which is a `"use client"` module because it
 * reaches for `localStorage` and `window.location`. A server component that
 * imported the address therefore pulled a client module into a server render
 * and returned a 500 for the whole front page. The address itself is nothing
 * but an environment variable, so it belongs somewhere either side can read.
 *
 * One definition: `lib/api.ts` re-exports this rather than repeating it.
 */
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:4000";
