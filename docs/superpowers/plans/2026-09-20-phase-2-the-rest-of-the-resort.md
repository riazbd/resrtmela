# Phase 2 — the rest of the resort

*Plan for [the native mobile app design](../specs/2026-09-13-native-mobile-app-design.md),
phase 2 of five. Phase 1 is [here](2026-09-20-phase-1-the-resort-core.md).*

**Done means:** everything a resort does, not only what a front desk does in a
day. The owner can see who has stayed, what has been spent, what the month
came to, and change the resort's own settings — without opening a laptop. At
the end, `moreFor` offers nothing that lands on "Not built yet" for a resort
user.

## Where this plan stands

| task | state |
|---|---|
| 1 — the nav guard, and rooms: list, detail, edit, types | **done** |
| 2 — guests: list and detail | **done** — assembled from two routes, because there is no `GET /guests/:id` |
| 3 — expenses | **done** — and the client's `expenses.categories` was typed `string[]` over a route that has always returned `{ category, uses }[]` |
| 4 — reports: the period, and P&L | **done** — `ResortMetrics` came off `unknown`, and the console's local copy of it is deleted |
| 5 — settings: the resort, its lists | **done** — `ResortSettings` came off `unknown`, which phase 1 named as a debt and left here |
| 6 — settings: team, rate plans | **done** — team is read-only, and the hub says why |
| 7 — profile | **done** |
| 8 — housekeeping | **blocked** — see below |
| 9 — F&B: menu, order, bill | not started — needs a client slice first |
| 10 — activities | not started — needs a client slice first |
| 11 — payroll | not started — needs a client slice first |
| 12 — import, and bulk email | not started |
| 13 — the APK, on a device | not started |

Twenty-five screens. The order is by what is most visibly missing rather than
by the section order in §5: **Rooms is a tab on the bar** and it said "Not
built yet" on every phone that installed 0.2.1, which no other gap did.

## What the remaining tasks actually cost

Written down after tasks 1–7, because the second half of this phase is
not the same shape as the first and the plan should stop pretending it
is.

**Housekeeping has no API.** §5 lists it as a screen; there is no
housekeeping controller, no route, and no page in the console. HOUSEKEEPING
exists only as a *role*. So this is not a screen to write — it is a
feature to design, and it belongs in a spec rather than at the end of a
list of ports. Task 8 is blocked until somebody decides what a
housekeeping screen is for.

**F&B, activities and payroll each need a client slice before a screen.**
The typed client has no group for any of them: the console reaches all
three through hand-written `api<...>` calls — four in activities, three
in F&B, one in payroll. §0.3's rule applies, so each task starts by
typing those routes against the controllers and porting the console onto
them in the same commit, exactly as phase 1's task 1 did for the desk.
That is where the drift is, and it is worth the order: phase 1's slice
found four wrong methods, one of them pointing at a route that had never
existed.

**Import and bulk email are desk work by nature**, and the argument for
them on a phone is weak: an import is a spreadsheet, and a campaign is a
paragraph somebody wants to re-read before sending to four hundred
people. They stay last, and may end up where the subscription and the
permission matrix are — named on the settings hub as deliberately absent.


## What phase 1 established, that this plan assumes

Phase 1 is done and its lessons are not restated here, with three exceptions
that changed how a screen gets written:

1. **A screen is verified by opening it, and the last build is opened on a
   device.** Phase 1's three worst defects — money losing its symbol, a figure
   wrapping inside its own digits, the status bar sitting on the content —
   were all invisible to 268 tests and to the browser lens, and all three were
   on the *first screen of the first build*. Hermes has no currency data and
   an emulator has a status bar; a browser has neither.
2. **A rule the API enforces and no client knows is a defect waiting at the
   end of a form.** `canEditStay` came out of a 409 a front desk met after
   filling the form in. Phase 2 touches settings and payroll, which are
   thicker with those rules than bookings were: each task reads the service
   before the screen.
3. **Test fixtures agree with the code rather than with the server unless
   somebody checks.** Every fixture in this phase is written from the
   controller or from a recorded response, never from the type alone.

## The guard this phase opens with

Eighteen of `CONSOLE_NAV`'s twenty-nine destinations have no route in the app
today: ten resort-side, which is this phase, and eight agent-side, which is
phase 3. Nothing says so except this paragraph, and a nav entry added later
with no screen behind it would be found by a user.

So task 1 adds a spec that walks `CONSOLE_NAV` against `apps/mobile/app` and
fails on any destination that is neither routable **nor** named in a
written-down list of what is still to come. The list shrinks as the phase
lands; a destination that is on neither side of it is a bug. It is the same
shape as `a-screen-never-writes-an-address.spec.ts`: a rule that cannot be
forgotten because forgetting it is red.

## Global constraints

Carried from phase 1 unchanged. The first three are the ones that have
actually bitten.

1. **TDD.** Red first, and the failing output is shown before the fix. A guard
   that cannot be made to fail is not a guard.
2. **The console must stay green.** `pnpm -F @rh/web test` is the gate on every
   commit that touches shared code. A red test stops the move; it is never
   edited to fit.
3. **Verify by looking.** A green suite is not evidence. Every task ends at
   `scripts/look.mjs`, and the phase ends on a device.
4. **One vitest run at a time**, and **stop the emulator before jest** — both
   are memory, not preference, on a machine with 8GB.
5. **Every screen file implements loading, empty and error.**
6. **No path literal in a screen.** The escape hatch is to add the route to
   `packages/shared/src/client.ts`, where the console gets it too — and to
   port the console's hand-written call sites onto it in the same commit.
7. **Nothing is deleted that this plan does not name.** The WebView
   (`src/console/`) stays until phase 4.
8. **A shared rule is extracted only when the second client needs it**, and
   the console moves onto it in the same commit. A function with one caller is
   speculation, not extraction.

## The data these screens are built against

Production's demo resort — `demo-resort@resortmela.com`, resort 3, "Demo Bay
Resort": three room types, ten rooms, nine bookings, five expenses, and now
BK-00009, which phase 1 took, paid, charged, checked out and edited through
the app itself.
