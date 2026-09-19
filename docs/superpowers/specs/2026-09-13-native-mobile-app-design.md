# The native mobile app — design

*2026-09-13. Supersedes the release plan of
[2026-09-13-mobile-app-design.md](2026-09-13-mobile-app-design.md) — sections 1
and 2 of that document (what the app is, why an app at all, no guest build)
still stand. What is replaced is section 3 onward: the app does not grow
screens out of a WebView over time. Every screen is written natively, and the
WebView is deleted.*

## 0. Revision — 2026-09-20

*The console kept moving for the week after this design was written, and one of
its premises stopped being true. Everything in this section corrects a number
or a decision below it; the architecture (§3), the UI direction (§1), the
offline rules (§7) and the refusals (§11) all stand. Every figure was counted
with `git ls-tree` and `git grep` at `172881b` — the day of the design — and at
`afb0474`.*

### 0.1 Section 3 is finished, and the app is not

Stages A and B both landed on 2026-09-13 (`7869c4a` … `d575c1d`, `4f7a7f7`).
`@rh/app-core` exists — ten modules, 1,605 lines — and the pure rules are in
`@rh/shared`. **Phase 0's tasks 1–3 are complete. Tasks 4–10 have not been
started**: expo-router, the tokens, the primitives, the patterns, the tab
shell, the auth screens and the APK. `apps/mobile` is still the `0.1.0` WebView
shell, and that is still the only APK ever produced (`RELEASES.md`).

Two outcomes of stage B bind every later phase: `Storage` is an injected port,
and `navigator.onLine` does not exist for shared code — connectivity is an
answer the caller supplies.

### 0.2 The measurement in section 2 is out of date

Section 2 counted only `page.tsx`, so it undercounted itself on the day it was
written. Both columns below count every `.tsx` under `apps/web/src/app` —
layouts and route-local components are screens too, and four of the biggest
things built since are route-local components rather than pages.

| | 2026-09-13 | 2026-09-20 | |
|---|---|---|---|
| UI in the app's scope | 12,397 | **15,467** | +25% |
| out of scope — platform, marketing, the public resort and agency pages | 3,184 | 3,942 | |
| API routes (`@Get`/`@Post`/…) | 226 | **294** | +30% |
| methods on the typed client | 143 | **144** | +1 |

**Section 2's "10,916 lines to write natively" should be read as 15,500.**

### 0.3 The typed client no longer covers the API. This is the one real blocker

Section 2 argued that the work is 11,000 lines and not 18,000 because
`packages/shared/src/client.ts` already types every route and already injects
its transport. That argument has quietly expired: the API grew by 68 routes and
the client by one.

The console did not notice because it never depended on it. Ten page files call
the typed client; the other thirty build their URLs by hand through
`apps/web/src/lib/api.ts` — **110 hand-written paths** in `app/**`. Whole areas
have no typed client at all:

> auth beyond `me`/`permissions` · activities · payments · import · bulk email
> · the website editor · the day sheet · the calendar · notifications ·
> everything under settings

A second client written against those same 110 template literals is a second
place for a renamed query parameter to be found by a user instead of a
compiler, and the two would disagree within a month. So:

- **A native screen never builds a URL.** `apps/mobile/test/` gets the guard
  that `apps/api/test/the-console-has-one-address.spec.ts` already demonstrates
  — a walk of `src` that fails on a path literal.
- **The client is completed phase by phase, not all at once.** Each phase's
  first commit adds exactly the routes that phase's screens call, typed against
  `api-types.ts`, and ports the console's own call sites onto them in the same
  commit. The console's suite is the gate, as it was for the extraction.
- That work is not a tax on the app. It is the same repayment the extraction
  was, and it lands on the console the day it is written.

### 0.4 Section 5's screen count: 56 → 72, before the cut in §0.5

Recounted against the routes and tabs that exist today.

| group | §5 | now | what changed |
|---|---|---|---|
| auth and shell | 5 | 5 | — |
| resort core | 13 | **15** | the stay bill (services, damage, fines) and editing a booking are their own screens on a phone |
| resort remainder | 14 | **15** | a payroll month now holds many payments |
| reports | 3 | **7** | §5 guessed three; the screen has Money, Summary, P&L, Agents, Sources, Daily, Audit trail |
| settings | 6 | **12** | §5 guessed six; the tabs are Resort info, Subscription, Website, API, Users & Roles, Permissions, Agent access, Lists, Activity log, Discounts, Messages, Your data |
| agent | 12 | **14** | the agency's own Website and API screens (`85b411a`, `8ca55ea`, `c65327b`) |
| shared | 3 | **4** | changing a password is its own screen (`4932898`) |
| | **56** | **72** | |

The two measurements agree: +29% of screens against +25% of lines. Section 5's
remark about an earlier count being "arithmetic done in a hurry" applies to its
own reports and settings rows, which were guesses at a tabbed page nobody had
opened.

### 0.5 Four screens come out of scope, on the reasoning that already excluded the homepage

§1 kept the platform console and the marketing homepage on the desk because
that is where they are used. The same test now excludes four more, and they are
the four a phone is worst at:

- **Settings → Website** (476 lines) — choosing a template and writing page copy
- **Settings → API** (341) — keys, webhooks and domains, a screen handed to a developer
- **Agent → Website** (340) and **Agent → API** (204 + 150) — the same two, for an agency

What replaces them is a **read-only status card** in each place: whether the
site is published and at what address, whether keys exist and when each was
last used. An owner on a phone needs to know the answer; nobody edits a
template or rotates a key from a phone, and pretending otherwise buys the
hardest 1,500 lines in the console for the least use.

**Import** stays, read-only: the last run, what it did, what it rejected.
Nobody uploads a spreadsheet from a phone either.

**Net: 72 − 4 = 68 screens**, and the 1,511 lines removed are the least
phone-suited in the whole count.

### 0.6 What the app must consume, and did not have to on 2026-09-13

Every feature built since put its rules in `@rh/shared` rather than in the
console. That discipline is why the extra 25% is only UI, and the app inherits
all of it for nothing — but a native screen that reimplements any of these is a
defect, not a shortcut:

`stay-charges.ts` · `discount.ts` · `agent-window.ts` · `booking-sort.ts`
(`BOOKING_SORTS`, `DEFAULT_BOOKING_SORT`) · `room-order.ts` (`compareRoomNames`,
`byRoomName`) · `payment-method.ts` · `plan-schedule.ts` · `payroll.ts` ·
`site.ts` · `webhook.ts` · `domain.ts` · `imported-receipt.ts`

`PLAN_FEATURES` gained `agency_website` and `agency_api`, and `NAV` is 30
entries rather than the 27 §4 names. The filter in §4 is unchanged; the list it
runs over is longer.

**Addresses.** The platform moved to its own domain on 2026-09-19: the console
is `https://resortmela.com`, the API is `https://api.resortmela.com`. The app
reads both from `expo-constants` — `apps/mobile/app.json` already carries them
— and never from a literal. `@rh/shared`'s `api-url.ts` takes the base as an
argument for exactly this reason.

### 0.7 What this does to section 10

Phase 0 keeps its remaining seven tasks and gains one: **the auth slice of the
typed client** — login, forgot, reset, change password, `me`, `permissions` —
written the way §0.3 describes, with the console ported onto it in the same
commit. It is the smallest possible proof that the rule in §0.3 holds, taken
before four more phases depend on it.

The later phases keep their shape and change their counts:

| phase | §10 | now | |
|---|---|---|---|
| 0 | 3 | 3 | + the auth slice of the client |
| 1 | 13 | **15** | resort core |
| 2 | 25 | **29** | remainder, reports (7), settings (10 after §0.5), profile, account, bulk email |
| 3 | 12 | **12** | agent, less its Website and API screens |
| 4 | 3 | 3 | signup ×2, invoice, push — and the WebView is deleted |
| | 56 | **68** | |

An APK still ships at the end of every phase, and is still installed on a real
phone before the next one begins.

## 1. The decision this document records

The owner asked for a real application, not a wrapper: "shob functionality
thakbe shekhane. awesome professional and enterprise grade UI thakbe." Given
three options — core screens native with a WebView holding the long tail,
everything native, or a prototype first — they chose **everything native, no
WebView**, with the cost of two UI codebases understood and accepted.

Two follow-up decisions, also theirs:

- **UI direction: operational density.** The Linear/Stripe-dashboard register —
  white ground, tight information, thin rules, the console's `#15803d` as the
  accent. Rejected: a card-led one-hand layout, and a dark operations console.
  Resort staff scan numbers; the screen should let them scan.
- **Scope at the edges.** In: signup (resort and agency), and the invoice
  screen with share/PDF. Out: the platform administration console (2,020 lines,
  the platform owner's own tool) and the marketing homepage. Those stay on the
  desk, where they are already used.

## 2. The size of the work, measured

*Superseded by [§0.2](#02-the-measurement-in-section-2-is-out-of-date) and [§0.3](#03-the-typed-client-no-longer-covers-the-api-this-is-the-one-real-blocker) — the figures below are 2026-09-13's.*

Counted, not estimated:

| | lines |
|---|---|
| all `apps/web/src/app/**/page.tsx` | 13,721 |
| less `platform/page.tsx` (out of scope) | −2,020 |
| less `(public)/**` marketing (out of scope) | −785 |
| **UI to write natively** | **10,916** |
| console components the design system replaces | 1,012 |
| console `lib/` (shared or ported, not rewritten) | 2,150 |
| API routes — already typed and transport-agnostic | 177 |

The 177 routes are why this is 11,000 lines and not 18,000.
`packages/shared/src/client.ts` injects its transport by design — *"where a
token lives is not this file's concern"* — so the mobile app reuses every route
without touching the file.

## 3. Architecture: three layers, one of them duplicated

```
apps/mobile/          native UI            ~11,000 lines, new
apps/web/             console UI           exists, unchanged in shape
        ↑ both import ↓
packages/app-core/    auth, query, i18n,   NEW — moved out of apps/web/src/lib
                      offline, outbox
packages/shared/      177 routes, types,   exists, gains the pure logic
                      pure logic
```

Only the top layer is written twice. Everything that decides *behaviour* —
what a permission means, what a plan includes, how the queue retries, what a
string says in Bangla — lives once.

React Native runs React, not react-dom. The console's contexts and hooks are
therefore portable as-is; what is not portable is `window.localStorage`, which
becomes an injected `Storage` port (localStorage on web, MMKV on native).

### 3.1 What moves to `packages/app-core`

| file | lines | why it must be shared |
|---|---|---|
| `lib/i18n.tsx` | 332 | two copies of a translation table will drift; this is certain, not likely |
| `lib/offline-queue.ts` | 222 | divergent queue semantics lose a resort's work |
| `lib/auth.tsx` | 211 | session, permissions and plan-feature gating must agree across clients |
| `lib/query.tsx` | 184 | cache invalidation |
| `lib/outbox.tsx` | 147 | |
| `lib/offline-cache.ts` | 134 | |
| `lib/load-state.tsx` | 49 | |
| `lib/use-debounced.ts` | 20 | |

### 3.2 What moves to `packages/shared` (pure, no React)

`console-access.ts` (139) · `agency-calendar.ts` (110) · `contact.ts` (86) ·
`calendar-month.ts` (82) · `resort-dates.ts` (72) · `calendar-bars.ts` (59) ·
`brand.ts` (57) · `resort-options.ts` (49) · `booking-handoff.ts` (45) ·
`password-reset.ts` (33) · `import-outcomes.ts` (29) · `api-url.ts` (13).

`console-access.ts` matters most: `navVisible` and `landingFor` decide who sees
which screen. Sharing it is what makes the phone and the desk agree about a
user's access rather than agreeing by coincidence.

### 3.3 How the move is done without breaking production

*Done, 2026-09-13. What it cost is recorded in the phase-0 plan and summarised in [§0.1](#01-section-3-is-finished-and-the-app-is-not).*

The console is live and serves a real business. The extraction is therefore two
stages with different risk profiles, and the second one has a net.

- **Stage A — data and pure functions.** Section 3.2 plus the i18n
  dictionaries. No state, no storage, no lifecycle. Move, re-export from the old
  path so no call site changes, run the suite.
- **Stage B — stateful contexts.** Section 3.1. Introduce the `Storage` port,
  move each context one at a time, keep the old module as a thin re-export.
  **The console's existing suite is the gate**: a red test stops the move. No
  context moves in the same commit as another.

A file that cannot move cleanly stays in `apps/web` and is reimplemented in the
app. That is a worse outcome, not a failure — it is recorded and moved on from.

## 4. Navigation

**expo-router**, not bare react-navigation. File-based routes give the app the
console's own paths — `/bookings`, `/agent/calendar`, `/settings/team` — so
parity is visible in the file tree rather than asserted, and deep links (a push
notification opening one booking) need no extra routing table.

Five bottom tabs, audience-dependent, everything else behind **More**:

```
resort staff   Home      Calendar      Bookings   Rooms   More
agent          Discover  Find a room   Calendar   Sales   More
```

Tab and More-item visibility comes from the shared `navVisible` applied to the
console's own 27 NAV entries, honouring both `perm` (what the owner granted)
and `feature` (what the resort's plan includes). A tab whose permission the
user lacks is not rendered; the tab bar compacts rather than showing a gap.

## 5. Screens — 56

*Recounted as 72, then cut to 68, in [§0.4](#04-section-5s-screen-count-56--72-before-the-cut-in-05) and [§0.5](#05-four-screens-come-out-of-scope-on-the-reasoning-that-already-excluded-the-homepage). Reports and settings below are guesses; the real tabs are listed there.*

Native needs more screens than the web, because the console uses tabs and
modals where a phone needs a pushed screen. The sections below sum to 56;
an earlier count of 46 was arithmetic done in a hurry and was wrong.

**Auth and shell (5)** — login · forgot password · reset · signup (resort) ·
signup (agency)

**Resort core (13)** — dashboard · day sheet · calendar (timeline) · month
availability · bookings list · booking detail · new booking step 1 (dates +
room) · step 2 (guest) · step 3 (payment) · check-in · check-out · take
payment · dues

**Resort remainder (14)** — guests list · guest detail · rooms list · room
detail · room edit · room types · housekeeping · F&B menu · F&B order · F&B
bill · expenses · activities · payroll · import

**Reports (3)** — occupancy · P&L · dues

**Settings (6)** — the 2,034-line tabbed page becomes: resort · team & roles ·
rate plans · taxes · payment methods · branding

**Agent (12)** — discover · resort detail · find a room · calendar · tours ·
sales list · sales document detail · guests · expenses · payroll · wallet ·
team

**Shared (3)** — invoice view with share/PDF · profile · bulk email

## 6. Design system

### Tokens
Colour (the console's `#15803d` primary, a neutral ramp, semantic status
colours), spacing on a 4pt grid, a type scale, radii, elevation. Defined once,
consumed by every component; no literal colour or pixel value in a screen file.

### Primitives
Text · Button (primary, secondary, danger, ghost) · Input · Select · DatePicker
· Switch · Checkbox · Badge · Card · Divider · Avatar · Money · Skeleton

### Patterns
StatRow · DataRow (with swipe actions) · SectionHeader · EmptyState ·
ErrorState · BottomSheet · Toast · PullToRefresh · FilterBar · MonthGrid ·
Timeline

### Rules that do not bend
- Touch targets ≥ 44pt.
- No type below 12pt — the same floor the console's phone stylesheet enforces.
- Every screen implements all three of loading, empty and error. A screen with
  only a happy path is not done.
- Money renders through `Money` with tabular figures, in the active resort's
  currency and locale.
- English is the default and Bangla is the toggle. A native screen does not get
  to disagree with the product it belongs to.
- Weekends are Friday and Saturday; the week starts Sunday.

## 7. Offline

The owner's earlier choice stands: readable offline, some actions queued. The
behaviour is the console's, because the modules are the console's.

**Readable without a network** — last-seen dashboard, today's day sheet,
bookings list, rooms. The screen states its age ("as of 12 minutes ago") rather
than pretending to be live.

**Queued** — check-in, housekeeping status, F&B orders, expenses.

**Never queued: creating a booking.** `UNIQUE(roomId, night)` is what makes
double-selling impossible, so a queued booking can fail legitimately on sync —
by which time staff have told a guest yes. Offering it would be a promise the
schema is designed to break.

## 8. Push notifications

New booking, payment received, check-in due, an agent's access request.

This requires the **only schema change in the whole project**: a `DeviceToken`
table (`userId`, `token`, `platform`, `lastSeenAt`, unique on `token`). It adds
a table and alters no existing column. It still runs against production only
with a verified backup and the owner's explicit word on the day.

Expo push (FCM underneath). A token is registered on login and deleted on
logout — a device that changes hands must not keep receiving a resort's
bookings.

## 9. Testing

TDD, red first, as throughout this project.

| layer | tool |
|---|---|
| shared logic (`packages/shared`, `packages/app-core`) | vitest — the existing suite |
| native components and screens | `@testing-library/react-native` |
| the extraction in section 3.3 | the console's existing suite as the gate |
| the build | an EAS APK at the end of each phase, run on a real phone |

A phase is not complete because its tests pass. It is complete when the APK has
been installed and the screens opened — a 200 from the API is not proof a
screen works.

## 10. Order of work

*Phase 0 tasks 1–3 are done; the counts below are corrected in [§0.7](#07-what-this-does-to-section-10).*

| phase | screens | contents | what exists at the end |
|---|---|---|---|
| **0** | 3 | monorepo wiring, extraction stages A and B, design system, expo-router shell, offline plumbing, login/forgot/reset | sign in, empty tabs — but the foundation is real |
| **1** | 13 | resort core | **an APK a front desk can work from** |
| **2** | 25 | resort remainder, reports, settings, profile, bulk email | the resort side complete |
| **3** | 12 | agent | both panels complete |
| **4** | 3 | signup ×2, invoice + share/PDF, push, polish | the WebView is deleted |

Totals to 56. An APK ships at the end of every phase and is installed on a real
phone before the next begins.

**Each phase gets its own implementation plan.** Fifty-six screens is far too
much for one plan to hold usefully; phase 0 is planned and executed first,
because what it establishes — the tokens, the primitives, the navigation
contract, the shape of a screen file — is what every later plan will assume.

## 11. What this design refuses

- **A guest build.** Unchanged since 2026-09-11: a guest is a row in a
  register, not an account.
- **iOS this pass.** Android first was chosen earlier and nothing here changes
  it. The design system and navigation are cross-platform, so iOS is a build
  target later, not a rewrite.
- **Offline booking creation.** Section 7.
- **Rewriting the API client.** 177 typed routes already exist and already
  inject their transport.
- **Refactoring the console's UI.** The console keeps its screens. Only `lib/`
  moves, and only behind its own test suite.
- **A second store listing.** One package name, `com.resortmela.app`, updated
  in place.
- **Native platform administration.** Out of scope by the owner's choice; it
  stays on the desk.
