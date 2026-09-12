# The mobile app — design

*2026-09-13. Supersedes nothing: the Expo guest app deleted earlier today was a
client for endpoints that no longer exist. This is a different product for a
different audience.*

## 1. What it is

One Android app, **Resort Mela** (`com.resortmela.app`), for the two paying
audiences the platform already has: resort staff and travel agents. No guest
build, ever — since 2026-09-11 a guest is a row in a resort's register, not an
account, so there is nobody to build a guest app for.

It is not a second product. It is a second client for the same API, and the
console remains the primary one.

## 2. Why an app at all

The console is responsive and works in a phone browser. Four things it cannot
do, and each is a requirement here:

1. **Push notifications.** A new booking, a check-in, a payment, an agent's
   request — the phone should buzz. Browsers cannot do this reliably, and on
   iPhone effectively not at all.
2. **Offline.** Resorts sit where the network comes and goes. Staff must be
   able to read today's sheet and record work without a connection.
3. **The camera.** NID photographs, bKash slips, room damage.
4. **Store presence.** An installable, branded app is part of how the platform
   is sold.

Anything that does not serve one of these four belongs in the console instead.

## 3. The shape: one app, natively grown

The app ships first as a native shell around the live console and is converted
to native screens one at a time, in place. The same package name, the same
install, the same users — they receive updates, never a migration.

```
Release 0   native chrome + WebView(console)          every screen works
Release 1   + push, camera, "Today" native            the front desk's day
Release 2   + offline read cache & write queue        the network stops mattering
Release 3+  a screen at a time turns native           until the WebView is unused
```

**Why this and not a rewrite:** a hand-written native app covering both panels
is roughly twenty-six screens. Built as a rewrite, nobody can use it until the
last one lands. Built this way, everybody can use all of it from the first
build, and each release makes a part of it faster and available offline. The
project also has one prior mobile app that was written and never built once —
the failure mode to design against is not "too few native screens", it is "no
APK on anyone's phone".

**Why Expo and not Capacitor:** Capacitor's shell cannot host React Native
screens, so Releases 1+ would mean throwing it away. An Expo app can render a
WebView as one screen among native ones. The WebView shrinks; the project never
restarts.

## 4. Architecture

```
apps/mobile  (Expo, TypeScript)
  app/            expo-router screens
  src/console/    the WebView host: session, back button, offline, links
  src/native/     native screens, added from Release 1
  src/lib/        api client (transport over expo-secure-store), push, storage
```

**The API client is not rewritten.** `packages/shared/src/client.ts` already
injects its transport — the console supplies a fetcher that reads
`localStorage`, and the app supplies one that reads `expo-secure-store`. All
164 routes and their response types come free, and a renamed parameter breaks
the app at compile time, which is the entire point of that file.

**Session.** One token, two holders. The native side owns it (SecureStore) and
hands it to the WebView on load, so the user signs in once and both halves are
authenticated. Sign-out clears both.

**Offline (Release 2).** Reads: TanStack Query persisted to storage, rendered
with a visible "last synced at" stamp — stale data shown as stale is useful;
stale data shown as fresh is a lie. Writes: a durable queue of intents, each
with a client-generated idempotency key, replayed in order when the network
returns.

What may be queued is a closed list, decided by whether a delayed write can
fail legitimately: check-in, check-out, expense, payment received, photograph,
housekeeping status. **Creating a booking is not on it.** `UNIQUE(roomId,
night)` makes double-selling impossible at the database level, so a booking
composed offline can be refused an hour later with the guest standing there.
The app will not pretend otherwise.

**Push.** A `DeviceToken` table (user, token, platform, last seen), registered
after sign-in and cleared on sign-out. The API sends through Expo's push
service. Notifications carry a deep link, so tapping one opens the booking, not
the home screen.

## 5. Release 0 — the scope that ships first

- Expo app, `com.resortmela.app`, icon and splash from `logo-mark.svg` (green
  `#15803d`).
- WebView of the production console. Both panels work, because the console
  already renders by role.
- Android back button navigates the console's history and only exits at its
  root.
- Pull to refresh.
- A Bangla offline screen with a retry button — never a blank white page.
- Camera and file permissions wired, so the console's uploads work from a phone.
- External links (`tel:`, `mailto:`, other hosts) open outside the app.
- Session persists across launches.
- A **signed release APK**, built locally: JDK 17 and the Android SDK are
  already installed on the build machine, so this needs no Expo account, no
  cloud queue, and no store account.

Then, if the day allows: push notifications end to end, and the "Today" screen
in native.

## 6. Testing

The API and the console keep their existing suites; this adds three kinds.

1. **The app exists and was built.** `apps/web/test/the-mobile-app-is-real.spec.ts`
   replaces this morning's `the-mobile-app-is-gone.spec.ts`, which encoded a
   decision that has since been reversed. It asserts the workspace exists, that
   `android.package` is set, and that a build has actually been produced — a
   type check cannot see that nobody ever ran Gradle, and that is precisely how
   the last app died.
2. **Unit tests** (Vitest) for the pieces with logic and no device: the URL
   policy (what opens inside versus outside), session hand-off, the offline
   queue's ordering and idempotency.
3. **The device itself.** Every release is installed with `adb`, signed into
   under both a resort role and an agent role, and walked. A build that
   compiles is not a build that works.

## 7. What this design refuses

- **A guest build.** There are no guest accounts.
- **Offline booking creation.** See §4.
- **A second store listing.** One app, role-aware, like the console.
- **Rewriting the API client.** `@rh/shared` is the contract; the app is a
  caller of it.
- **iOS in this pass.** Nothing here blocks it — Expo builds both — but it
  needs a paid account and a review cycle, and it is not what was asked for.
