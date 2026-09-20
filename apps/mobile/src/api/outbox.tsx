/**
 * The write queue, wired to a phone.
 *
 * `OutboxProvider` in `@rh/app-core` was written with three holes in it
 * because each one is a different object here than in a browser: knowing
 * whether there is a network, telling somebody a write was refused, and
 * making the call. The console fills them with `navigator.onLine`,
 * `window.alert` and its own `api`. This fills them with NetInfo, the
 * platform's own alert, and ours.
 *
 * What may wait is `canWaitOffline`'s decision, and the rule is identity
 * rather than urgency: a write that creates a row and carries its own
 * reference can be replayed all day and still make one row. On a phone the
 * question is not hypothetical — a resort in the hill districts loses the
 * network mid-morning, and a guest is standing at the counter.
 */
import { useMemo, type ReactNode } from "react";
import { Alert } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { OfflineQueue, OutboxProvider, guardedStorage } from "@rh/app-core";
import { deviceStorage } from "../device/storage";
import { api } from "./session";

/**
 * Last known connectivity, kept here so the queue can ask at the instant a
 * write fails rather than being told in advance. Connectivity changes
 * while the queue is running — that is the whole point of it.
 *
 * It starts at `true`: with no answer yet, `isNetworkError` falls back to
 * judging the error on its own, which is the conservative reading.
 */
let connected = true;

/**
 * `isInternetReachable` is the honest question and it is nullable — null
 * means NetInfo has not finished asking. A null read as `false` would put
 * the desk into offline mode on every cold start, so only a definite `no`
 * counts as offline.
 */
function watchOnline(onChange: (online: boolean) => void) {
  return NetInfo.addEventListener((state) => {
    const online = state.isConnected !== false && state.isInternetReachable !== false;
    connected = online;
    onChange(online);
  });
}

const queue = new OfflineQueue(
  // a replay is always a POST: the three writes that may be held all
  // create a row and all carry their own reference
  (path: string, body: Record<string, unknown>) => api(path, { method: "POST", body }),
  guardedStorage(deviceStorage()),
  () => connected,
);

/**
 * A queued write the server refused.
 *
 * The one case where something a person did did not happen and only they
 * can fix it, so it is never swallowed and never merely logged. An alert
 * is blunt, and blunt is right: the alternative is a guest who was checked
 * in on this phone and is not checked in anywhere else.
 */
function announceRejected(label: string, reason: string) {
  Alert.alert("That did not go through", `${label}\n\n${reason}`);
}

export function Outbox({ children }: { children: ReactNode }) {
  const send = useMemo(
    () => (path: string, body: Record<string, unknown>, method: string) =>
      api(path, { method, body }),
    [],
  );

  return (
    <OutboxProvider
      queue={queue}
      send={send}
      watchOnline={watchOnline}
      announceRejected={announceRejected}
    >
      {children}
    </OutboxProvider>
  );
}
