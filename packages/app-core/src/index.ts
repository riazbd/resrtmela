/**
 * What the console and the mobile app both run.
 *
 * `@rh/shared` holds the API and the pure rules. This package holds the React
 * that sits on top of them — session, permissions, query cache, translations,
 * the offline cache and the write queue — with the browser taken out of it, so
 * that React Native can run the same code the console does.
 *
 * Nothing here may import react-dom, `window`, or `document`. If a module needs
 * one of those it belongs in `apps/web`, not here.
 */
export { guardedStorage, memoryStorage, type Storage } from "./storage";
export { useDebounced } from "./use-debounced";
export { useLoadFailure, type LoadFailure } from "./use-load-failure";
export {
  CacheStore,
  MAX_CACHE_AGE_MS,
  cacheKeyOf,
  describeAge,
  type Cached,
} from "./offline-cache";
export {
  OfflineQueue,
  canWaitOffline,
  isNetworkError,
  type FlushResult,
  type QueuedKind,
  type QueuedWrite,
  type Sender,
} from "./offline-queue";
export {
  OutboxProvider,
  useOutbox,
  type OutboxValue,
  type OutboxProviderProps,
} from "./outbox";
export {
  QueryProvider,
  useApi,
  useMutation,
  useQueryClient,
  worthRetrying,
  keys,
} from "./query";
export {
  DICTS,
  DEFAULT_LANG,
  LangProvider,
  isStateKey,
  useLang,
  useT,
  type Lang,
  type DictKey,
} from "./i18n";
export { AuthProvider, useAuth, type AuthValue, type AuthPorts } from "./auth";
