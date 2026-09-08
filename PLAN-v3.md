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

### P0 — Stop the product lying — **shipped**

Each of these was a place the interface asserted something untrue.

1. **Suspension enforced.** `TenantStateService.assertWritable()` blocks the
   paths that create obligation and returns 402, not 403, so it reads as a
   billing matter. Reads stay open by design.
2. **Tax applied.** `taxRatePct` was editable and used nowhere. Now exclusive,
   charged on the discounted amount, floored at zero, and carried into booking
   detail, the list, the Day Sheet, today's arrivals, the dues ledger, a guest's
   own trip, and both the printed and emailed invoice. Revenue reporting stays
   net of it — tax is collected, not earned. Default 0, so existing tenants see
   no change.
3. **Prefixes are the tenant's.** `bookingPrefix` and `fbPrefix` join
   `invoicePrefix`. Changing one continues the sequence rather than restarting
   it, so a number is never reused.
4. **Lists say what they withheld.** `common/page.ts` gives a clamped
   skip/take and an envelope with the true total. Guests and expenses are on
   it; the expenses rollups are now aggregated in the database over the whole
   selection rather than summed over one page, and the guest directory's
   per-guest last-stay query is gone.

**Still capped and returning bare arrays** — same pattern, each needs its web
caller moved with it: `fb.list` (300), `reports.collectors` (300),
`activities.list` (200), `platform.listDues` (200), `engage.notifications`
(100), `walletTxns` (100), `emailCampaigns` (50). Of these only `fb.list` can
realistically be reached by a working resort inside a year; the rest are recent-
activity feeds where a cap is honest. Finish `fb.list` first.

### P1 — Make a tenant a real tenant — **mostly shipped**

**Done when:** a second resort can be created with a different currency,
timezone and plan, and nothing in the codebase needs to change.
*Met — proved by `test/integration/second-tenant.spec.ts`, which stands up a
USD/Honolulu tenant with its own prefixes, its own tax rate and a plan invented
after the code was written.*

1. **Timezone (H3).** Was a live bug, not a future one: every day boundary came
   from UTC, so for six hours each night the arrivals board, the restaurant's
   in-house list and the D-1 reminder sweep all ran on yesterday. `civilDateIn`
   / `todayIn` resolve the resort's civil date; the UTC-only `today()` is
   deleted so the mistake cannot recur.
2. **Currency and locale (H1, H2).** `formatMoney` in `@rh/shared` is the one
   implementation for all three apps, via Intl `narrowSymbol`. `Resort.locale`
   added. `bdt()` — the currency was in the function name — became `money()`,
   bound to the active resort; 86 call sites, 13 inline renders and the input
   labels all follow the tenant now.
3. **Plans and trial length (H4, H5).** `Subscription.plan` was a Prisma enum,
   which was the real lock. It is a string naming `PlatformPlan.name`; the DTO
   validates against the table; fee and `trialDays` come from the row. And
   `ensurePlans` no longer resets `maxResorts` on every call, which had been
   silently undoing the super admin's edits.
4. **Prefixes (H6).** Shipped in P0.

**Still open in §2.1:** notification and email templates are in code (H7), so a
tenant cannot change a word of what is sent under their own name — this needs a
template table and an editor, and is the largest remaining piece. Phone
normalisation still assumes +880 (H8), which is correct today and wrong the
first time this is sold abroad. `Resort.settings` (H9) remains an unread
column; leave it or drop it, but do not build on it.

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
