"use client";

/**
 * The console's outbox.
 *
 * `OfflineQueue` moved to `@rh/app-core`. It had to: the rule about what may
 * wait for a connection — a write that carries its own reference may be
 * replayed, an edit may not — is the difference between taking a guest's money
 * once and taking it twice, and that is not a rule to have two copies of.
 *
 * What stays here is what the browser knows: where to write, and whether there
 * is a network. `navigator.onLine` is the console's answer to the second; the
 * app's is NetInfo, and neither can see the other's.
 */
import { OfflineQueue, isNetworkError as isNetworkErrorFor, type Sender } from "@rh/app-core";
import { browserStorage } from "./offline-cache";

export {
  OfflineQueue,
  canWaitOffline,
  type FlushResult,
  type QueuedKind,
  type QueuedWrite,
  type Sender,
} from "@rh/app-core";

/** Whether this failure means "try again later", as the browser sees it. */
export function isNetworkError(error: unknown): boolean {
  return isNetworkErrorFor(error, typeof navigator === "undefined" ? true : navigator.onLine);
}

/** A queue wired to this browser: its storage, and its idea of connectivity. */
export function browserQueue(send: Sender): OfflineQueue {
  return new OfflineQueue(send, browserStorage, () =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
}
