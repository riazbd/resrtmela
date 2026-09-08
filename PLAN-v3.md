# Resort Mela — Replan v3: build the platform, not the resort

> Written 2026-09-09 after a code audit of the whole workspace. Supersedes the
> priority order in [ROADMAP.md](ROADMAP.md) and [STRATEGY.md](STRATEGY.md).
> [PLAN.md](PLAN.md) and [PLAN-v2.md](PLAN-v2.md) stand — the domain model and
> the Day Sheet insight were right and are not being revisited.
>
> Every claim below is a grep or a test result, not an impression.

## 0. The correction this plan is built on

v2 was built from one resort's workbook. STRATEGY.md then went further and set
product priorities from that same single workbook — a resort with a collection
problem, three idle rooms and an abandoned expense register. Those are one
tenant's facts. **They are input, not direction.**

The thing being built is a multi-tenant platform. Its customers are resort
owners; its product is the software; its revenue is subscriptions. Judged as a
platform rather than as Sky Eco's replacement spreadsheet, the picture changes
completely — and so does what to build next.

## 1. What is genuinely good, and stays

Worth stating plainly, because most of the audit below is critical and the core
here is better than the periphery suggests.

- **The booking engine is correct and provably so.** `UNIQUE(roomId, night)`
  makes a double sale impossible at the database level, not the application
  level. Two simultaneous requests for the same room: exactly one wins.
- **Money is computed, never stored.** One implementation, 90 tests behind it.
  Reproduces a manager's hand-kept revenue grid at 98.9% (2,038 of 2,060 cells).
- **The Day Sheet insight was right.** Merging three hand-maintained grids into
  one computed screen is the correct product idea and it is done.
- **Tenancy isolation holds.** Every scoped route filters by `resortId`; an
  API key pointed at another resort gets 403.

Nothing below proposes touching any of it.

## 2. Audit

### 2.1 Hardcoding — "nothing may be hardcoded"

| # | What | Evidence | Why it matters for a platform |
|---|---|---|---|
| H1 | `৳` written into 92 code sites | `grep '৳'` | `Resort.currency` is stored and **never read**. A tenant billing in USD or INR is impossible without a code change |
| H2 | `en-IN` / `en-GB` number and date formatting | `toLocaleString("en-IN")` throughout | Locale is a property of the viewer, not of the binary |
| H3 | `Resort.timezone` never read | only appears in DTOs | Every day boundary is UTC. A resort outside +06 gets the wrong day on its Day Sheet, its arrivals list and its revenue attribution |
| H4 | Plan names, fees and limits as constants | `PLAN_FEES`, `PLAN_LIMITS`, `PLAN_RESORTS`, `PLAN_SEEDS`, and `@IsIn(["STARTER","GROWTH","CHAIN"])` in a DTO | `PlatformPlan` is a database table with an editing UI, yet **adding a plan requires a code change and a redeploy** |
| H5 | `TRIAL_DAYS = 14` | constant | Trial length is a commercial lever, not a build-time constant |
| H6 | Booking prefix `BK`, F&B prefix `RES` | `BOOKING_CODE_PREFIX`, `FB_PREFIX` | `Resort.invoicePrefix` **is** configurable, so the system is inconsistent with itself. The client's own settings sheet lists "Booking Prefix" as a setting |
| H7 | Notification and email templates in code | `notifications/templates.ts`, inline HTML | A tenant cannot change a word of what is sent to their guests under their own name |
| H8 | Phone normalisation assumes +880 | `normalizePhone` | Fine today, wrong the first time it is sold outside Bangladesh |
| H9 | `Resort.settings` JSON never read | grep | Dead extension point |

### 2.2 The platform cannot enforce its own terms

| # | What | Evidence |
|---|---|---|
| P1 | **Suspending a resort did nothing.** `setResortStatus` wrote a column no guard read — a tenant who stopped paying kept the full product | fixed in this commit; see §4 |
| P2 | No subscription lifecycle automation. Trials never expire, dues are never raised, `PAST_DUE` is never reached | only `sweepAgentDeadlines()` exists |
| P3 | `taxRatePct` is editable in Settings and **applied to nothing** | grep across bookings/reports/payments: zero hits. The UI makes a promise the system does not keep |
| P4 | No tenant data export | grep |
| P5 | No per-tenant branding — every invoice and email is Resort Mela's, not the resort's | only `fromName` on email |
| P6 | The permission matrix is largely decorative: **59 `requireRoles()` hard gates against 17 permission checks**. A custom role with every box ticked still cannot do what the fixed role enum forbids | grep |

### 2.3 Engineering

| # | What | Evidence |
|---|---|---|
| E1 | **No typed API contract.** `packages/shared` exports 3 types for ~130 routes; web and mobile hand-roll interfaces per file | grep |
| E2 | **Zero tests outside the API** — web and mobile have none | `find` |
| E3 | ~11 list endpoints silently truncate at `take: 200/300/500`; only 7 of ~130 routes paginate | grep |
| E4 | N+1 queries: `guests()` issues one query per guest for last stay; agent discovery does the same per resort | `bookings.service.ts:788`, `engage.service.ts:68` |
| E5 | No observability — no APM, no metrics, no structured logs. PM2 restarts crashes silently | grep |
| E6 | Rate limiter is an in-process `Map` — it does not survive a restart or a second process | `rate-limit.middleware.ts` |

### 2.4 Front end

| # | What | Evidence |
|---|---|---|
| U1 | **No data layer.** 53 `useEffect` fetches, no cache, no dedupe, no retry, no optimistic update. Every navigation refetches everything | grep |
| U2 | **Zero error boundaries, zero `loading.tsx`.** A thrown error is a white screen | `find` |
| U3 | Pages are unmaintainable: bookings 746 lines / **41 `useState`**; settings 1,015 lines / 32; rooms 362 / 31 | `wc`, grep |
| U4 | 14 UI primitives, no Table, Tabs, Drawer, DatePicker, Pagination or Form abstraction — hence U3 | `ui.tsx` |
| U5 | **"Bangla-first" is ~16% real**: 68 dictionary keys, `useT()` used on 4 of 25 pages | grep |
| U6 | Nothing works on a bad connection. Sajek, Bandarban and the hill districts have poor connectivity; a front desk that cannot check a guest in because the network dropped is worse than the paper register it replaced | no offline handling anywhere |

## 3. The plan

Sequenced by one rule: **a platform earns money only when it can onboard a
tenant without us, enforce its own terms, and never promise what it does not
do.** Feature depth comes after that.

### P0 — Stop the product lying (days, not weeks)

Each of these is a place the interface asserts something untrue. They are cheap
and they are the difference between a product a stranger trusts and one they
don't.

1. ~~Suspension enforced~~ — **done**, §4.
2. **Tax**: apply `taxRatePct` to booking totals and invoices, or delete the
   field and its Settings row. Applying it is the right call — VAT is real for a
   registered resort — but shipping either is better than the current state.
3. **Truncation**: every capped list returns `{rows, total}` and the UI says
   "showing 200 of 431". No silent lies about how much data exists.
4. **Prefixes**: booking and F&B codes read from resort settings like invoices
   already do.

**Done when:** no screen states a fact the API cannot back.

### P1 — Make a tenant a real tenant (~1 week)

Everything in §2.1. One `Money` and one `Dates` module, both taking the
resort's currency, locale and timezone; plans read entirely from
`PlatformPlan`; templates in the database and editable; the constants deleted.

**Done when:** a second resort can be created with a different currency,
timezone and plan, and nothing in the codebase needs to change.

### P2 — Make the permission model real (~4 days)

Replace all 59 `requireRoles()` gates with permission checks. Roles become
named presets over the permission set — which is what the Settings UI already
tells the owner they are. This is what lets the product fit an org chart it has
never seen, which is the whole difference between a platform and a bespoke build.

**Done when:** a custom role with every permission ticked can do everything a
`RESORT_ADMIN` can, and one with none can do nothing.

### P3 — Run the platform (~1 week)

Subscription lifecycle sweep (trial → active → past due → suspended, with
notice before each). Tenant data export. Per-tenant branding on invoices and
guest email. Observability: structured logs, error tracking, and an uptime
check — currently nobody is told when anything breaks.

**Done when:** a tenant can sign up, be billed, fall behind, be suspended,
pay, and resume, without anyone touching a database.

### P4 — Rebuild the front end on an architecture (~2 weeks)

1. A generated or hand-maintained typed client in `packages/shared`, consumed
   by web and mobile. E1 disappears and both apps stop drifting from the API.
2. TanStack Query for the data layer — cache, dedupe, retry, optimistic writes.
   U1 disappears and the app stops refetching everything on every navigation.
3. `error.tsx` and `loading.tsx` per route group.
4. Grow the primitive set, then decompose the 700–1,000 line pages onto it.
5. Finish the Bangla dictionary and route every page through `useT()`.
6. **Offline-tolerant front desk.** Check-in, check-out and collect-payment
   queue locally and reconcile when the connection returns. This is the single
   most valuable thing this product can do for a hill-district resort, and no
   competitor selling into that market does it.
7. Web and mobile smoke tests, so E2 stops being true.

**Done when:** the front desk's three critical actions work with the network
off, and no page exceeds ~300 lines.

### P5 — Only then, growth features

Guest payment collection (SSLCommerz), channel manager, mobile app release.
These are good, and none of them matters while a non-paying tenant keeps full
use of the product and the front desk cannot work offline.

## 4. Shipped with this plan

**Suspension is enforced.** `TenantStateService.assertWritable()` blocks the
paths that create new obligations — bookings, expenses, money — and returns
**402 Payment Required**, not 403, so the message reads as a billing matter
rather than a permissions bug.

Reads stay open on purpose. An owner behind on a bill must still be able to
open their books and export them. Holding a tenant's own data hostage is how a
platform guarantees they never come back.

Six tests cover it: no new bookings, no expenses, a message that says
"suspended", reads still working, and full function restored on reactivation.
90/90 pass; all five packages typecheck.

Write-path coverage is currently bookings and expenses — the two that create
financial obligation. F&B, payments and payroll follow in P0; the service is in
place and each is a one-line call.

## 5. What I would drop

- **Chain/multi-resort as a sold segment.** Built for a customer never met.
  Keep the capability, stop building for it.
- **OTA channel sync and embed themes.** Both assume a maturity the platform
  has not reached.
- **The mobile app release.** Guests already book on the web; the app adds a
  store listing, not a capability. Revisit when P4's offline work makes a native
  shell genuinely better than the browser.
