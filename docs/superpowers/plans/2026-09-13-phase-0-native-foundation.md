# Phase 0 — the foundation the other 53 screens stand on

*Plan for [the native mobile app design](../specs/2026-09-13-native-mobile-app-design.md),
phase 0 of five. Executed in this session, by me, without subagents — the owner
asked for that explicitly.*

**Done means:** a signed APK in which a real user signs in with an email or a
phone, lands on the tab bar their permissions allow, sees it rendered in the
design system, and can sign out. No WebView on any screen this phase owns.

## Where this plan stands — 2026-09-20

| task | state |
|---|---|
| 1 — the Storage port | **done** (`7b17f0f`) |
| 2 — stage A, pure logic into `@rh/shared` | **done** (`7869c4a`, `bd45941`) |
| 3 — stage B, the stateful contexts | **done** (`2a0cc5c` … `d575c1d`, `4f7a7f7`) |
| 4 — the app's dependencies | not started |
| 5 — design tokens | not started |
| 6 — primitives | not started |
| 7 — patterns | not started |
| 8 — the navigation shell | not started |
| 9 — the auth screens | not started |
| 10 — the APK | not started — `0.1.0`, the WebView shell, is still the only build |

**Task 8a is new**, and runs before task 9: *the auth slice of the typed
client*. `packages/shared/src/client.ts` types 144 of the API's 294 routes and
has no `auth` beyond `me`/`permissions`, so the login screen would otherwise
hand-write its first URL and set the precedent for every screen after it. Add
`login`, `forgot`, `reset` and `changePassword` to the client, port the
console's own call sites onto them in the same commit, and keep the console's
suite green. The reasoning is in §0.3 of the design.

Task 9 then has no path literal in it, and `apps/mobile/test/` gains the guard
that fails on one.

## Global constraints

1. **TDD.** Red first, and the failing output is shown before the fix. No
   exceptions, including for "obvious" moves.
2. **The console must stay green.** `pnpm -F @rh/web test` is the gate on every
   extraction commit. A red test stops the move; it is never edited to fit.
3. **One context per commit** in stage B. Never two.
4. **One vitest run at a time** — API suites share `resorthub_test` and truncate
   each other. (Recorded in memory; it has already cost this project a run.)
5. **Nothing is deleted that this plan does not name.** The WebView
   (`src/console/`) stays until phase 4, unused but present.
6. **No production writes, no deploy, no schema change** in this phase.
   `DeviceToken` belongs to phase 4.
7. **Every screen file implements loading, empty and error.** A happy path alone
   is not a finished screen.

## Task 1 — the Storage port

The one thing that is not portable between the console and the app is
`window.localStorage`. Everything in stage B waits on this.

- **Red:** `packages/app-core/test/storage.spec.ts` — a memory store round-trips,
  reports absent keys as `null`, clears; a store whose backing throws (a private
  window, a browser with site data blocked) reads `null` and swallows writes
  rather than crashing the app.
- **Green:** `packages/app-core/src/storage.ts` — `interface Storage` with
  synchronous `getItem`/`setItem`/`removeItem`/`clear` (sync because that is
  localStorage's contract and every caller being moved assumes it),
  `memoryStorage()`, `guardedStorage(backing)`.
- Create the package: `@rh/app-core`, `main` → `src/index.ts` like `@rh/shared`,
  `react` as a peer dependency, its own `vitest.config.ts`. Add to
  `apps/web` dependencies and `next.config.mjs` `transpilePackages`.

## Task 2 — stage A: pure logic into `@rh/shared`

Twelve files, no state, no storage, no React. Moved, then re-exported from their
old paths so no call site in `apps/web` changes.

Planned as twelve files. Reading them first cut it to ten, in two batches:

**Batch 1, moved unchanged (7)** — `console-access.ts` · `agency-calendar.ts` ·
`calendar-month.ts` · `calendar-bars.ts` · `booking-handoff.ts` ·
`password-reset.ts` · `resort-dates.ts`

**Batch 2, need a signature change (3)** — `contact.ts` (imports `@rh/shared`,
which becomes relative) · `brand.ts` and `api-url.ts` (both read
`process.env.NEXT_PUBLIC_API_URL`, which does not exist on a phone: the
normalisation is shared, the value is passed in)

**Two files the plan was wrong about, corrected on reading them:**

- **`resort-options.ts` is not pure.** It imports `@/lib/api` and `@/lib/query`
  — it is a React hook, not a rule. It moves in stage B, not here.
- **`import-outcomes.ts` stays in `apps/web` this phase.** Its `style` values
  are Tailwind class strings, which mean nothing in React Native. The labels
  deserve to be shared and the classes do not, but the semantic vocabulary that
  would replace them can only be chosen with the native import screen in front
  of me — which is phase 2. Splitting it now is the same guess this project
  refused to make for `MonthGrid`.

**One name collision, found by moving them.** `calendar-month.ts` and
`resort-dates.ts` both exported `monthOf`, and they are different functions: one
truncates a date to its month, the other does arithmetic on one. A package with
a single front door cannot export both, so `resort-dates`'s becomes
`shiftMonth` in shared and the console's shim aliases it back. No call site in
the console changed.

**The net is already built.** These existing console specs cover the surface and
must pass unchanged, before and after:

```
console-access.spec.ts        agency-calendar.spec.ts    contact.spec.ts
a-calendar-can-go-to-a-month.spec.ts  calendar-bars.spec.ts
resort-dates.spec.ts          brand.spec.ts              booking-handoff.spec.ts
password-reset.spec.ts        the-import-report-says-what-happened.spec.ts
```

- **Red:** a new `packages/shared` spec importing each symbol from `@rh/shared`
  fails to resolve before the move.
- **Green:** move, re-export, run the console suite.
- `api-url.ts` reads `NEXT_PUBLIC_API_URL`. In shared it takes the base URL as
  an argument instead; the console passes its env var at the call site.

## Task 3 — stage B: the stateful contexts

One commit each, in dependency order, console suite green between every one.

| # | file | lines | note |
|---|---|---|---|
| 3.1 | `use-debounced.ts` | 20 | no storage; warm-up |
| 3.2 | `load-state.tsx` | 49 | no storage |
| 3.3 | `offline-cache.ts` | 134 | first real `Storage` consumer |
| 3.4 | `offline-queue.ts` | 222 | covered by `offline-queue.spec.ts` |
| 3.5 | `outbox.tsx` | 147 | covered by `offline-sync.spec.ts` |
| 3.6 | `query.tsx` | 184 | |
| 3.7 | `i18n.tsx` | 332 | dictionaries are data; covered by `language.spec.tsx` |
| 3.8 | `auth.tsx` | 211 | last — everything above is its dependency |

`auth.tsx` also calls `window.location.href` in `exitImpersonation`. That is
navigation, not storage: it becomes an injected `navigate(path)` callback, which
the console fills with a location assignment and the app with a router push.

### What stage B actually cost, recorded as it went

Each of these was invisible until the module was moved.

- **`ApiError` had to move too.** `offline-queue` asks whether a failure was a
  5xx or a 403, and the class lived in `lib/api.ts` — a `"use client"` module.
  Asking that question therefore meant importing the browser. It is now in
  `@rh/shared`.
- **`navigator.onLine` is not portable and was never right.** React Native has
  no such property, and at a resort the wifi is routinely up while the uplink is
  down. `isNetworkError` takes the answer from its caller now.
- **`CacheStore` must be handed an *unguarded* store.** It has a better answer
  to a full quota than `guardedStorage` does — drop the oldest half and retry —
  and a guard would have silently retired it.
- **`AuthProvider` must be handed a *guarded* one.** `isImpersonating` is read
  during render, so it runs while Next prerenders on the server. The moved code
  carried a `typeof window` check for exactly that.
- **The retry rule was hiding in a lambda.** Extracted as `worthRetrying`: a 4xx
  is never retried, and nothing could check that before.
- **Two providers needed splitting, not moving.** `load-state`'s hook is
  portable and its `<ErrorState>` renderer is not; `outbox`'s judgement is
  portable and its three browser errands — connectivity, alerting, the call —
  became props.
- **jsdom is the test harness, not a permission.** `no-browser-in-here.spec.ts`
  scans `src` for `window`, `document`, `localStorage`, `navigator` and
  react-dom, with comments stripped, so the rule is checked rather than trusted.

**A gap the suites cannot see.** vitest runs in jsdom, where `window` exists, so
nothing in either suite exercises server prerendering. `pnpm -F @rh/web build`
is the only proof that the guarded-storage decision above is right, and it is
run before this phase is called done.

**If a file will not move cleanly**, it stays in `apps/web` and is reimplemented
in the app. That outcome is recorded in this plan and moved past — it is not a
reason to force a refactor through a red suite.

## Task 4 — the mobile app's dependencies

- `expo-router` (file-based routes matching the console's paths), with
  `react-native-screens`, `react-native-gesture-handler`,
  `react-native-reanimated`, `expo-linking`.
- `react-native-mmkv` — synchronous storage, which is what the `Storage` port
  requires. **This is the one unproven dependency in the phase**, so it is
  proved by task 10's build, not assumed. If MMKV will not build on EAS, the
  fallback is a synchronous in-memory store flushed asynchronously to
  `@react-native-async-storage/async-storage`.
- `@testing-library/react-native` and `jest-expo`-free vitest setup for
  component tests.
- Metro config keeps its existing shape.
  `disableHierarchicalLookup` stays off — switching it on has already cost this
  project a build, and the comment in `metro.config.js` says why.

## Task 5 — design tokens

- **Red:** a spec asserting no screen may use a literal colour — the token
  module is the only source — and that the type scale has no step below 12.
- **Green:** `src/design/tokens.ts`: colour (primary `#15803d`, a neutral ramp,
  semantic status colours), spacing on a 4pt grid, type scale, radii, elevation.

## Task 6 — primitives

Each one red first, with a rendering test.

Text · Button (primary, secondary, danger, ghost; disabled and pending states) ·
Input · Select · DatePicker · Switch · Checkbox · Badge · Card · Divider ·
Avatar · Money · Skeleton

**Money** carries the rules that already exist in the console: the active
resort's currency and locale, tabular figures, and never a bare number.

**Button** enforces the 44pt floor in the component, not in each caller.

## Task 7 — patterns

StatRow · DataRow (with swipe actions) · SectionHeader · EmptyState ·
ErrorState · BottomSheet · Toast · PullToRefresh · FilterBar

`MonthGrid` and `Timeline` are deferred to phase 1, where the calendar screens
that define their requirements are built. Building them now would be guessing.

## Task 8 — the navigation shell

- expo-router layout with five bottom tabs, filtered by the **shared**
  `navVisible` over the console's own NAV entries, honouring `perm` and
  `feature`.
- Resort staff: Home · Calendar · Bookings · Rooms · More.
  Agent: Discover · Find a room · Calendar · Sales · More.
- **Red:** a spec that an agent never sees a resort tab, that a user without
  `rooms.view` gets a four-tab bar rather than a gap, and that `landingFor`
  routes each role to a screen that is theirs.
- More holds every remaining permitted destination, same filter.
- Tab screens are placeholders this phase — the shell is what is being built.

## Task 9 — the auth screens

Three screens, in the design system, against the live API:

- **login** — email *or* phone, no country code required (the national-suffix
  fallback shipped this session), password, "Forgot password?".
- **forgot password** — the neutral sentence, whichever identifier was typed.
- **reset** — opened by a token from the emailed link, via expo-linking.

Session token in MMKV through the `Storage` port; sign-out clears the offline
cache, exactly as `logout()` already does in the console.

## Task 10 — the APK

- `eas build --profile preview` (APK, internal). `production` emits an AAB for
  Play, which no phone installs.
- Bump `versionCode` to 2 and the version to `0.2.0`.
- **Verification is on a real phone, by the owner.** Installed, signed in,
  tabs correct for their role, signed out. A green suite and a finished build
  are not evidence that a screen works.

## What phase 0 deliberately does not do

- No resort or agent screens. Tabs land on placeholders; phase 1 fills them.
- No `MonthGrid`/`Timeline` (task 7).
- No push, no `DeviceToken`, no migration — phase 4.
- No iOS.
- No deletion of `src/console/` — phase 4.
- No change to the console's own screens. Only `lib/` moves.
