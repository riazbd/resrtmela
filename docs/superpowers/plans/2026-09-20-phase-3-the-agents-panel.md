# Phase 3 — the agent's own panel

An agency sells rooms it does not own. Four of its twelve screens are on
the phone already — discover, search, calendar, quotes — because they are
the ones a booking passes through. The other eight are the business
*behind* the booking: what it sold, who bought, what it spent, who it
pays, what it is owed, who works there, and the two things it sells
through.

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

Money first — wallet, then expenses and payroll, because an agency owner
away from the desk is usually asking one of those three. Then what it
sells: tours and guests. Then the three administrative ones.

## Tasks

| task | state |
|---|---|
| 1 — the agent slice, checked against the controllers, console call sites ported | not started |
| 2 — wallet | not started |
| 3 — expenses | not started |
| 4 — payroll | not started |
| 5 — tours | not started |
| 6 — guests | not started |
| 7 — team | not started |
| 8 — website and api | not started |
| 9 — the whole panel, on the owner's phone | not started |

## How it is verified

Expo Go on the owner's phone, over `adb reverse`. Phase 2 settled why:
the emulator cannot run on this laptop, and the phone found five defects
in twenty minutes that a browser and 973 tests had all missed. Each one
became a rule rather than a memory, and this phase inherits those rules —
`nobody-writes-that-sentence-twice`, `no-module-imports-its-own-barrel`,
`a-tab-label-fits-on-the-bar`, and the client guard.

Every task ends at a screen opened on the phone. The phase ends with the
agent's twelve swept in one pass.
