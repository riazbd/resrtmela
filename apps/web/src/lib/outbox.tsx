"use client";

import { useMemo } from "react";
import { OutboxProvider as SharedOutboxProvider } from "@rh/app-core";
import { api } from "@/lib/api";
import { browserQueue } from "@/lib/offline-queue";

export { useOutbox, type OutboxValue } from "@rh/app-core";

/**
 * The outbox as the console runs it.
 *
 * All the judgement moved to `@rh/app-core` — what may wait for a connection,
 * when to retry, and the refusal a person gets instead of a silent loss. Three
 * things stayed, because each of them is a different object on a phone:
 *
 * - **Connectivity.** `navigator.onLine` plus the window's online/offline
 *   events. A phone asks NetInfo instead, and neither can see the other's.
 * - **Telling a person.** `window.alert` is blunt, and blunt is correct here:
 *   a queued write the server refused is the one case where something they did
 *   did not happen and only they can fix it.
 * - **The call.** `api` carries the console's token.
 */
export function OutboxProvider({ children }: { children: React.ReactNode }) {
  const queue = useMemo(() => browserQueue((path, body) => api(path, { method: "POST", body })), []);

  return (
    <SharedOutboxProvider
      queue={queue}
      send={(path, body, method) => api(path, { method, body })}
      watchOnline={(onChange) => {
        onChange(typeof navigator === "undefined" ? true : navigator.onLine);
        const back = () => onChange(true);
        const gone = () => onChange(false);
        window.addEventListener("online", back);
        window.addEventListener("offline", gone);
        return () => {
          window.removeEventListener("online", back);
          window.removeEventListener("offline", gone);
        };
      }}
      announceRejected={(label, reason) => window.alert(`Could not save: ${label}\n\n${reason}`)}
    >
      {children}
    </SharedOutboxProvider>
  );
}
