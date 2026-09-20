/**
 * What the app is wired to: storage, the transport, the typed client.
 *
 * These lived in `session.tsx` until 2026-09-20, and that made a circle —
 * `session` imported `Outbox`, and `outbox` imported `api` back out of
 * `session`. Metro allows it and says so on every launch:
 *
 *     Require cycle: src/api/session.tsx -> src/api/outbox.tsx ->
 *     src/api/session.tsx
 *     Require cycles are allowed, but can result in uninitialized values.
 *
 * "Can result in uninitialized values" is the part that matters. Which of
 * the two modules finishes evaluating first depends on which one something
 * else reaches for first, and the loser sees `undefined` where a constant
 * should be. It does not fail today; it fails the day an import somewhere
 * else changes order, and the symptom then is `api` being undefined inside
 * the outbox, which reads as a network bug.
 *
 * Found by opening the app on a real phone through Expo Go. Metro prints
 * this to the app's own console, not to the terminal running the tests,
 * so nothing in a green suite was ever going to mention it.
 *
 * So the shared bottom of the graph lives here, and both import downwards.
 */
import { router } from "expo-router";
import { CacheStore, guardedStorage } from "@rh/app-core";
import { createApiClient } from "@rh/shared";
import { deviceStorage } from "../device/storage";
import { API_URL } from "./config";
import { makeApi } from "./transport";

/**
 * One store, two views of it, and the difference is load-bearing.
 *
 * The session is guarded: nothing it does has a cleverer answer to a failed
 * write than carrying on, and a front desk that cannot open because storage
 * misbehaved is not a trade worth making. The cache is *not* guarded,
 * because `CacheStore` has a better answer to a full store than swallowing —
 * it drops the oldest half and retries — and a guard would silently retire
 * that.
 */
const device = deviceStorage();
export const session = guardedStorage(device);
export const cache = new CacheStore(device);

/**
 * Stepping out of an impersonated session. In the console this is a full
 * page load, so nothing of the tenant's is left in memory; a phone has no
 * such thing, so it is a router replace and the provider clears what it
 * holds itself.
 *
 * A module constant rather than an inline arrow: it reaches a dependency
 * array inside the provider, and a new function each render would make the
 * context value new each render, re-rendering every screen that reads it.
 */
export const goTo = (path: string) => router.replace(path as never);

const onSignedOut = () => router.replace("/login");

export const api = makeApi({ baseUrl: API_URL, storage: session, onSignedOut });
export const client = createApiClient(api);

/** Two answers in one request: what this person may do, and what the plan includes. */
export const permissionsFor = (resortId?: number) => client.permissions(resortId);
