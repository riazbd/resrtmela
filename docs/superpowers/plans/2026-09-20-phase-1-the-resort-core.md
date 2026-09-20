# Phase 1 — the fifteen screens a front desk lives in

*Plan for [the native mobile app design](../specs/2026-09-13-native-mobile-app-design.md),
phase 1 of five, as revised by §0 on 2026-09-20.*

**Done means:** a clerk with a phone and no laptop can run a day. Take a
booking, price it before taking it, check the guest in, put a charge on the
bill, take the money, check them out, and read the day back. On a real
phone, installed from a real build — not in a browser lens and not in an
emulator.

## Where this plan stands

| task | state |
|---|---|
| 1 — the desk slice of the typed client | **done** (`the-desk-is-typed.spec.ts`, and the guard `a-screen-never-writes-an-address.spec.ts`) |
| 2 — the read screens: dashboard, day sheet, dues | **done** — and each one found something a test could not: the app had no query provider, and the day sheet opened on UTC's yesterday |
| 3 — the bookings list | **done** — and it drew "Invalid Date" over every row while nineteen tests passed |
| 4 — the booking detail and its stay bill | **done** (read-only; the write actions arrive with task 7) — and `BookingDetail` was lying about two things |
| 5 — the calendar and month availability | **done** — two lenses on one screen, as the console has it |
| 6 — making a booking (single, group, walk-in) | **done** — three steps, a draft above them, and BK-00009 taken on production through it. Looking at it found two things twenty tests did not |
| 7 — arrival, departure, payment | **done** — walked on production: checked in, took ৳2,000, added and removed a charge, checked out. The outbox is wired, so the three writes a guest is waiting for survive a dead network |
| 8 — editing a booking | not started |
| 9 — the APK, on a phone | not started |

## What task 1 found

§0.3 argued for completing the client phase by phase on the grounds that a
second set of hand-written paths would disagree with the first within a month.
Writing this phase's slice turned up that the *first* set had already drifted,
in four places, every one of them because the console was not leaning on it:

| method | what it said | what the API does |
|---|---|---|
| `bookings.checkout` | `POST /bookings/:id/checkout` | **no such route, ever.** Leaving is `transition(id, "CHECKED_OUT")` |
| `bookings.pay` | answers a `BookingDetail` | answers `{ payment, booking, replayed }` — and `replayed` is the whole point of the offline queue's `clientRef` |
| `createGroup` | answers `BookingDetail[]` | answers a group tag, a count, and an id and code per room |
| `today` | `unknown` | a feed whose rows are *not* bookings — no dates, a guest with no id, and `arriving`/`departing` instead |

`checkout` is the one that matters most: phase 1 has a check-out screen, and
built on that method it would have failed in front of a guest. Nobody called
it, so nobody found out — which is the argument for the rule, restated as a
fact.

The slice also added the five desk routes the client did not have at all —
`quote`, `extraPersons`, `addCharge`, `removeCharge`, `approveLate` — and
typed the bodies of `create`, `createGroup`, `update` and `pay`, which were
`unknown`. Thirteen hand-written paths came out of the console's bookings
page, its stay desk and its dashboard in the same commit.

**Two guards came with it.** `the-desk-is-typed.spec.ts` parses the three
controllers that declare these routes and fails on any client method pointing
at a path nobody wrote — which is how `checkout` should have been caught.
`a-screen-never-writes-an-address.spec.ts` walks `apps/mobile/src` and
`apps/mobile/app` and fails on `fetch`, on `API_URL`, on an absolute URL, on a
second `createApiClient`, and on a path handed to anything that sends it.

## What is still hand-written, and whose phase it is

`GET /resorts/:id` is read twice in the console's bookings page — once for the
room types' extra-person rules, once for `agentPaymentHours`. It stays
hand-written for now: typing a resort's whole settings object is the settings
slice, and phase 2 owns it. The app does not need it — the room types it
wants come from `client.rooms.types(resortId)`, which is typed already.

## Global constraints

These carry over from phase 0 unchanged, and the first two are the ones that
have actually bitten.

1. **TDD.** Red first, and the failing output is shown before the fix. A guard
   that cannot be made to fail is not a guard: introduce the violation, watch
   it go red, take it back out.
2. **The console must stay green.** `pnpm -F @rh/web test` is the gate on every
   commit that touches shared code. A red test stops the move; it is never
   edited to fit.
3. **One vitest run at a time** — API suites share `resorthub_test` and
   truncate each other.
4. **Every screen file implements loading, empty and error.** A happy path
   alone is not a finished screen.
5. **No path literal in a screen.** The guard enforces it; the escape hatch is
   to add the route to `packages/shared/src/client.ts`, where the console gets
   it too.
6. **Nothing is deleted that this plan does not name.** The WebView
   (`src/console/`) stays until phase 4.
7. **Verify by looking.** A green suite is not evidence that a screen works.
   Every task ends at `scripts/look.mjs`, and the phase ends on a real phone.

## The data these screens are built against

Production's demo resort — `demo-resort@resortmela.com`, resort 3, "Demo Bay
Resort": three room types, ten rooms, eight bookings with two checked in, five
expenses. It exists so that every screen in this phase has something real
behind it, and it has already earned its keep — the day sheet's room order bug
was found by looking at it, not by a test.
