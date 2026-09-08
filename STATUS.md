# Resort Mela — where the project stands

*Last updated 2026-09-09. This is the entry point: read it before the other
planning documents, which it summarises and sequences.*

| Document | What it is | Still current? |
|---|---|---|
| **STATUS.md** (this file) | Where things stand, what is left, how to work on it | **Yes — start here** |
| [PLAN-v3.md](PLAN-v3.md) | The platform audit and the plan it produced | Yes — the working plan |
| [PLAN-v2.md](PLAN-v2.md) | The Day Sheet insight, read out of the client's workbook | Yes — domain model |
| [PLAN.md](PLAN.md) | Original architecture and phase plan | Historical; the engine it describes is what shipped |
| [STRATEGY.md](STRATEGY.md) | Business analysis of one tenant's books | Observations stand; its priorities are superseded by PLAN-v3 |
| [ROADMAP.md](ROADMAP.md) | Production-readiness audit of the live VPS | Partly — see §5, several items still open |

---

## 1. What this is

A multi-tenant SaaS for resort operations: bookings, front desk, restaurant,
expenses, payroll, agents, reports. Its customers are resort owners; its
product is the software; its revenue is subscriptions.

Turborepo + pnpm. NestJS 11 + Prisma → MySQL 8 / MariaDB. Next.js 15 console,
Expo mobile app. ~22,000 lines of source across `apps/api`, `apps/web`,
`apps/mobile`, `packages/db`, `packages/shared`.

**One thing to hold on to:** it is a platform, not one resort's software. Sky
Eco Resort is a tenant whose spreadsheet the domain model was read out of. Its
particulars are input, not direction — a mistake worth naming because it was
made once already, in STRATEGY.md.

## 2. Where it stands

**The engine is good, and provably so.** This is worth saying plainly, because
everything else here is critical.

- A room cannot be sold twice. `UNIQUE(roomId, night)` makes it impossible at
  the database level, not the application level — two simultaneous requests,
  exactly one wins, verified under real concurrency.
- Money is computed, never stored, in one place. It reproduces a manager's
  hand-kept revenue grid at **98.9%** (2,038 of 2,060 cells).
- Tenancy isolation holds: every scoped route filters by `resortId`.

**What was weak was everything around it** — the things that make software a
product other people can buy and someone can run. That is what this pass
addressed, and what remains.

Current state: **146 tests** (34 at the start of this pass, all of them pure
unit tests; there are now 19 integration suites running against a real MySQL),
all five packages typecheck clean, and the repository can be provisioned from
scratch — which it could not before.

## 3. What was done

Nineteen commits on `fix/audit-2026-09-09`, 100 files, +4,404 / −618.
Every change was written test-first and watched fail for the right reason.

### The repository could not build a working database

Two independent faults. Six migration files carried a UTF-8 BOM, which MySQL
rejects outright. And the migration history was **16 tables behind the schema**:
everything after 2026-09-03 — the platform/SaaS layer, roles and permissions,
payroll, food packages, CMS — had been applied with `prisma db push`, which
writes no migration. A fresh environment came up missing all of it.

With no backups (§5), there was no recovery path at all. Fixed, and verified by
building a database from empty: 10 migrations, 39/39 tables, zero drift.

### The same stay was worth different amounts on different screens

Booking money was computed in four places with four slightly different rules.
Two were wrong:

- Guest notifications quoted rent without multiplying by nights — a guest owing
  ৳13,000 was told ৳5,000.
- The daily revenue report ignored nights *and* the discount, credited the whole
  stay to the check-in date, double-counted charged-to-room F&B, and missed any
  stay that ran through the range without starting in it.
- An agent on flat-fee terms saw their own commission as a percentage:
  **৳75,000 where the owner's report said ৳1,000.**

One `common/money.ts` now, and every caller goes through it.

### The public booking API had never worked

`POST /v1/bookings` — the endpoint a resort's own website uses — synthesised
claims with `userId: 0`, which went straight into three foreign keys. No user
has id 0. Every call failed on a constraint violation, and no API key existed
anywhere, so nothing had ever exercised it. The same claims carried
`SUPER_ADMIN`, one bug away from reaching every tenant; it is scoped to its own
resort now.

### Login codes did not survive a restart

OTP codes lived in a per-process `Map`, in the clear, seeded from `Math.random`.
An API restart silently invalidated every code in flight. They are in the
database now, SHA-256 hashed, generated from the CSPRNG, compared in constant
time, and consumed on use.

### The interface made promises the system did not keep

- **Suspending a resort did nothing.** The status column was written and never
  read: a tenant who stopped paying kept the whole product. It now blocks the
  paths that create obligation and returns **402**, not 403, so it reads as a
  billing matter. Reads stay open on purpose — an owner behind on a bill must
  still be able to open and export their own books.
- **The tax rate was editable and applied to nothing.** Now charged on the
  discounted amount and carried into every total and both invoice formats.
  Revenue reporting stays net of it: tax is collected, not earned.
- **Lists stopped at a hard cap and said nothing.** A resort with 431 guests saw
  200. They now report the true total, and the expenses rollups are aggregated
  in the database over the whole selection rather than summed over one page.
- **Editing a plan's limits did nothing**, and a "backfill" reset them on every
  call — silently undoing the super admin's edits.

### Nothing that should have been per-tenant actually was

- The taka sign was written into **92 code sites** while `Resort.currency` was
  never read once; the web helper was called `bdt()`.
- `Resort.timezone` was never read, so every day boundary came from UTC. **This
  was live, not theoretical:** for six hours every night the arrivals board, the
  restaurant's in-house list and the D-1 reminder sweep all ran on yesterday —
  reminding guests who were arriving that morning, and burning the dedupe key so
  the correct reminder never went.
- Plans were fixed by constants, a DTO allow-list, and a Prisma enum. Adding one
  meant a migration and a deploy.

All three are data now. Proven by a test that stands up a **USD / Honolulu**
tenant with its own prefixes, its own tax rate and a plan invented after the
code was written — with no code change.

### The permission matrix was mostly decorative

Settings tells an owner that ticking boxes decides what a user can do. Forty
resort-scoped endpoints ignored it and checked the fixed role enum instead, so a
custom role with every box ticked could not do what the enum forbade, and one
with no boxes could do whatever its role allowed. All forty are permission
checks now.

Two things surfaced doing it. **"activities" named two different powers** —
`activities.view` and `activities.delete` gated the *audit log* while Settings
labelled them "View activities" beside a real activities feature, so an owner
ticking that box was granting something else entirely. And the **nav still gated
on roles**, which would have shown links the API now refuses.

### Smaller, but shipped

Per-tenant document prefixes · the guest directory's per-guest N+1 removed ·
wallet payments no longer mark a multi-night stay paid · mojibake repaired
across the repo including three strings guests actually saw (an invoice line
printed `Snorkelling <?> 2`) · idle inventory priced in taka on the dashboard ·
live passwords removed from the roadmap.

## 4. What is left

Ordered by one rule: **a platform earns money only when it can onboard a tenant
without us, enforce its own terms, and never promise what it does not do.**

### P3 — Run the platform ⟵ next

The suspension *mechanism* exists; nothing turns it on. There is no
subscription lifecycle at all: trials never expire, dues are never raised,
`PAST_DUE` is never reached. **Today a tenant who stops paying is never
suspended, because nobody notices.**

1. **Lifecycle sweep** — trial → active → past due → suspended, with notice
   before each step. Sits beside the existing agent-deadline sweep.
2. **Tenant data export** — the other half of "we do not hold your data
   hostage", and the thing that makes suspension defensible.
3. **Per-tenant branding** — invoices and guest email currently go out as
   Resort Mela's, not the resort's.
4. **Observability** — structured logs, error tracking, uptime checks. Right
   now PM2 restarts a crash and nobody is told.

*Done when a tenant can sign up, be billed, fall behind, be suspended, pay, and
resume, with nobody touching a database.*

### P4 — Give the front end an architecture

The console works and has no structure underneath it.

1. **A typed API client** in `packages/shared`. Three types are shared across
   ~130 routes today; web and mobile hand-roll interfaces per file and drift.
2. **A data layer** (TanStack Query). 53 `useEffect` fetches with no cache, no
   dedupe, no retry, no optimistic writes — every navigation refetches
   everything.
3. **`error.tsx` and `loading.tsx`.** There are none. A thrown error is a blank
   white screen.
4. **Decompose the large pages onto a real primitive set.** Bookings is 746
   lines with 41 `useState`; settings 1,015 with 32. There are 14 primitives and
   no Table, Tabs, Drawer, DatePicker, Pagination or Form — which is why.
5. **Finish the Bangla.** "Bangla-first" is 68 keys used on 4 of 25 pages.
6. **An offline-tolerant front desk.** Check-in, check-out and collect-payment
   should queue locally and reconcile. Sajek and the hill districts have poor
   connectivity, and a front desk that cannot check a guest in because the
   network dropped is worse than the paper register it replaced. No competitor
   selling into that market does this.
7. **Web and mobile tests.** There are none; all 146 are API-side.

### P5 — Growth features, only after the above

Guest payment collection (SSLCommerz — one integration covers bKash, Nagad and
cards; `payment_intents` and a mock provider already exist, so it is an adapter
swap). Channel manager. Mobile app release.

None of these matters while a non-paying tenant keeps full use of the product
and the front desk cannot work offline.

### Still open from earlier passes

- **Templates are in code.** A tenant cannot change a word of what is sent to
  their guests under their own name. Needs a template table and an editor — the
  largest single piece left in the "nothing hardcoded" work.
- **Phone normalisation assumes +880.** Correct today, wrong the first time this
  is sold abroad.
- **Seven list endpoints still return bare arrays.** Only `fb.list` can
  realistically be reached by a working resort inside a year; the rest are
  recent-activity feeds where a cap is honest.
- **`Resort.settings` is an unread column.** Leave it or drop it, but do not
  build on it.

### Deliberately dropped

**Chains as a segment** — built for a customer never met; keep multi-resort as a
capability, stop building for it. **OTA channel sync** and **embed themes** —
both assume a maturity the platform has not reached. **The mobile app release** —
guests already book on the web; revisit when P4's offline work makes a native
shell genuinely better than the browser.

## 5. Things only the account owner can clear

These are not code problems and cannot be fixed from the repository.

1. **Rotate the live passwords.** The super admin, manager and agent passwords
   were committed in plain text and pushed to GitHub. They are out of the file
   now but remain readable in commit `7ac3ba8`, so they must be treated as
   public. Start with the super admin, which can impersonate any resort admin.
   Then decide whether to purge history — rewriting forces everyone to re-clone,
   and once the passwords are rotated, leaving it is defensible.
2. **Database backups.** The VPS crontab is empty. All business data is in
   MariaDB with no backup at all. Nightly `mysqldump`, kept 14 days, copied
   somewhere off the server, and a restore tested once.
3. **Monitoring.** Nothing tells anyone when something breaks.
4. **SSLCommerz merchant account** — needed before P5's payment work can start.
   Requires a trade licence, TIN and a bank account.
5. **SMS sender ID** — the SSL Wireless adapter is written and dormant; only
   `SMS_SENDER_ID` is missing.

## 6. Deploying this branch

Live already has the September tables via `db push`, so it must be told they are
applied rather than trying to apply them:

```
prisma migrate resolve --applied 20260908120000_sept_platform_roles_payroll_cms
prisma migrate deploy
```

Then the six migrations from this pass apply normally: `otp_codes`, per-resort
code prefixes, `Resort.locale`, `PlatformPlan.trialDays`, the subscription plan
column, and the permission split.

**One behaviour change to expect:** `/reports/daily` numbers move. The old
figures were wrong — no nights multiplier, no discount, F&B double-counted — so
the new ones are correct, but say so before anyone notices on their own.

## 7. Working on it

```
pnpm install
pnpm -F @rh/api test:setup     # creates resorthub_test and migrates it
pnpm -F @rh/api test           # 146 tests
pnpm typecheck                 # all five packages
pnpm dev                       # api :4000, web :3000
```

The integration suites run against a real MySQL on purpose. The guarantees they
cover — the `booking_nights` guard, recomputed money, per-resort counters — only
exist at the database level, so testing them against a fake proves nothing.
`resetDb` refuses any database whose name does not end in `_test`.

**A note on the tests:** they are the safety net for everything above, and they
have teeth. Reintroducing the nights-multiplier bug fails 14 tests across 3
files. If a change here does not break something, be suspicious of the change.
