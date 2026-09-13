# The native mobile app — design

*2026-09-13. Supersedes the release plan of
[2026-09-13-mobile-app-design.md](2026-09-13-mobile-app-design.md) — sections 1
and 2 of that document (what the app is, why an app at all, no guest build)
still stand. What is replaced is section 3 onward: the app does not grow
screens out of a WebView over time. Every screen is written natively, and the
WebView is deleted.*

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
