# Phase 3 — the agent's own panel

An agency sells rooms it does not own. **All twelve of its screens are
placeholders.** The plan opened saying four were built, because four
route files exist — and all four are `NotBuiltYet`. An agent signing in
lands on `/agent/discover`, which is the first of them, so the app as it
stands is a sign-in screen and a wall.

Four are the booking itself — discover, search, calendar, quotes — and
eight are the business behind it: what it sold, who bought, what it
spent, who it pays, what it is owed, who works there, and the two
things it sells through.

`CONSOLE_NAV` has carried all twelve since phase 0, and
`every-door-opens.spec.ts` has named the eight as `phase 3` ever since,
so the More list already offers them and the guard already knows they owe
a route. Deleting a line from `NOT_YET` is how a screen is declared done.

## What is already in place

- **The typed client's `agent` slice** — `tours`, `books`, `payroll`,
  `sales`, `guests`, `rooms`, `calendar`, `wallet`, `activity` — written
  in phase 2 against the controllers.
- **Permissions**: every row above carries its own, and two carry a plan
  feature (`agency_website`, `agency_api`). `navVisible` already hides
  what a person may not have, so no screen needs to check twice.
- **The bar**: `barLabel` shortened three agent tabs before they were
  drawn — Discover, Search, Quotes.

## What each screen owes

| # | screen | what it is for | what stays on the desk |
|---|---|---|---|
| 1 | wallet | what the agency is owed and has been paid, and by whom | — |
| 2 | tours | the packages it sells, and what they cost | building a package from scratch |
| 3 | guests | who has travelled with it | merging duplicates |
| 4 | expenses | the day's spending, against its own heads | the heads themselves |
| 5 | payroll | the month, and paying it | hiring |
| 6 | team | who works here and on what role | the permission matrix |
| 7 | website | whether the site is on, and its address | the page editor |
| 8 | api | whether a key exists, and revoking one | minting a key |

The right-hand column is the same rule phase 2 settled: **rules are
identical, screens are not, and every absence is said on the screen.**
A permission matrix and a page editor are worse on a phone; a wallet
balance and this month's wages are better.

## Order

The booking first, because the landing screen is one of them and an
agent cannot do the thing the app is for. Discover, search, calendar,
quotes. Then money — wallet, expenses, payroll — which is what an owner
away from the desk asks about. Then what it sells: tours and guests.
Then the three administrative ones.

## Tasks

| task | state |
|---|---|
| 1 — the agent slice, checked against the controllers, console call sites ported | **done** — `6e4e02d`; nine routes answered `unknown`, four were missing, two defects found by typing |
| 2 — discover, the screen an agent lands on | not started |
| 3 — search, and the room it finds | not started |
| 4 — calendar | not started |
| 5 — quotes and invoices | not started |
| 6 — wallet | not started |
| 7 — expenses | not started |
| 8 — payroll | not started |
| 9 — tours | not started |
| 10 — guests | not started |
| 11 — team | not started |
| 12 — website and api | not started |
| 13 — the whole panel, on the owner's phone | not started |

## How it is verified

Expo Go on the owner's phone, over `adb reverse`. Phase 2 settled why:
the emulator cannot run on this laptop, and the phone found five defects
in twenty minutes that a browser and 973 tests had all missed. Each one
became a rule rather than a memory, and this phase inherits those rules —
`nobody-writes-that-sentence-twice`, `no-module-imports-its-own-barrel`,
`a-tab-label-fits-on-the-bar`, and the client guard.

Every task ends at a screen opened on the phone. The phase ends with the
agent's twelve swept in one pass.
