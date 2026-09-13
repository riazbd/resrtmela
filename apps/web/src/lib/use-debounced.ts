/**
 * Moved to `@rh/app-core` so the mobile app's search boxes behave the same.
 *
 * `"use client"` stays on this side. It marks a module boundary for Next, and
 * the shared package should not have to know that Next exists.
 */
"use client";

export { useDebounced } from "@rh/app-core";
