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

Current state: **324 API tests** across 41 files (34 at the start of this pass,
all of them pure unit tests; there are now 29 integration suites running against
a real MySQL) plus **24 front-end tests**, which is 24 more than there were. All
five packages typecheck clean, the console builds, and the repository can be
provisioned from an empty database — which it could not before.

## 3. What was done

Thirty-one commits on `fix/audit-2026-09-09`, 164 files, +12,070 / −1,490.
Every change was written test-first and watched fail for the right reason.

The first eleven sections below are the audit pass (P0–P2); §3.10 onwards is
the work that followed it — running the platform, the front end, and the
things that were still hardcoded.

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

### A tenant who stopped paying was never noticed

P0 built the machinery to suspend a tenant and nothing ever turned it on. A
trial never ended, a renewal never raised a bill, and `PAST_DUE` was a status no
code path could reach: **a tenant could stop paying and keep the full product
indefinitely, because the platform had no clock.**

There is one now. An hourly sweep walks every subscription -- trial -> active ->
past due -> suspended -> back again on payment -- with notice before every step
that costs the tenant something. It is idempotent by construction
(`UNIQUE(subscriptionId, periodStart)`, so a second run cannot raise a second
invoice) and it catches up: every step asks "is this date past", never "did this
happen yesterday", so a platform that was down for a week lands in the right
state on its first sweep.

`resorts.suspendedReason` records *who* suspended a resort, so the sweep never
lifts a suspension a human imposed for fraud. Paying lifts its own within the
second, not at the next sweep.

The windows -- grace, deadline, notice -- are platform settings, so changing a
commercial term is an edit by the person who owns it. The defaults are chosen
for this market: subscription payments here arrive by bKash or bank transfer
with a human in the loop, so seven days of grace is normal and cutting someone
off on the day is not.

### The suspension notice made a promise the software could not keep

It said records "stay readable and exportable". The second half was not true:
there was no export. A platform that can switch a business off *and* holds the
only copy of its guest register is not selling software.

Eight datasets as CSV or one JSON archive, **available while suspended**, scoped
to one resort, with money recomputed by the shared function so an exported total
reconciles against the dashboard. Every file carries a byte-order mark, because
Excel on Windows renders Bangla guest names as mojibake without one and the
owner concludes the export is broken.

### The guest heard from us, not from the resort

Every email went out as `Resort Mela: booking confirmed` -- the platform's name
on the resort's message to their own guest, with a subject line generated by
taking the underscores out of a template id. The guest had never heard of Resort
Mela. The resort was paying for software that put someone else's brand in front
of their customer.

Now a message about a stay is from the resort, with the resort's own contact
details; a message about a subscription is from the platform; and a subject line
is written rather than generated. Interpolated values are escaped -- a guest
picks their own name, and it ends up inside HTML we send.

**And the words are the resort's.** Four guest-facing messages are editable per
resort, with the built-in wording as a fallback rather than seeded rows, so a
new resort works on day one and a fix to the default reaches everyone who has
not overridden it. A placeholder the message will never be given is refused when
it is saved -- otherwise it renders as "?" in front of a guest and the resort
finds out from the guest.

### Nobody was told when it broke

PM2 restarted a crash and the only evidence was a gap in the log. A 500 handed
the caller whatever an internal `Error` said -- Prisma puts the failing query in
there, and it went straight to the browser. A support call ("it broke at about
four") could not be connected to anything.

Every request now carries an id, echoed in `X-Request-Id`, printed in one JSON
line with method, status, duration, user and resort, with credentials redacted
from the query string. A failure returns that id; above 500 it returns *only*
that id. `uncaughtException` and `unhandledRejection` each print one structured
line before the supervisor takes over. `/health` asks the questions that catch
something: is the database reachable and how fast, and has the notification
queue stopped draining -- the failure nobody notices, because guests simply stop
getting confirmations.

### The console had no architecture underneath it

Three things, fixed together because fixing them separately meant touching every
page three times.

**One contract.** 164 routes had three descriptions of what they return: the
API's service signatures, a block of interfaces in the console, and a
hand-rolled copy in whichever page needed one -- 64 across the console, 9 more
in mobile. They now live in `@rh/shared`, the API imports its own page envelope
from there, and `createApiClient(fetcher)` writes each route down once. Typing
them found a defect: `/resorts/:id/dues` returns `{total, count, rows}` where
`total` is money owed, and two callers had hand-typed it as a paged list whose
`total` is a row count.

**A data layer.** 53 `useEffect` fetches with no cache, no dedupe, no retry.
TanStack Query, with defaults chosen for a hill-district connection: 30s stale
time, retry twice with backoff but never on a 4xx, refetch on reconnect and not
on window focus. Every write names the screens it invalidates. The reports page
had been running seven reports *sequentially*; they now run together. The
notification bell polled on a `setInterval` that kept firing in a tab left open
overnight -- 1,440 requests to tell a closed laptop nothing happened.

**Something to show when it breaks.** There were no error boundaries at all: a
thrown error rendered a blank white page. Now `error.tsx`, `loading.tsx`,
`not-found.tsx` and `global-error.tsx`, in the reader's language, showing the
request id the API returns.

### "Bangla-first" was 68 keys on four screens out of twenty-five

The words still in English were the ones that matter most: the state of a
booking -- rendered as the raw enum with its underscore swapped for a hyphen,
`CHECKED-IN` -- the button that takes a guest's money, and the message shown
when something breaks at 11pm in Sajek. 108 keys now, and the dictionary is
typed so a key added in English and forgotten in Bangla fails the build rather
than falling back silently in front of a customer.

Five missing primitives landed with it -- Tabs, Table, DateNav, Pagination,
Drawer -- which is why the biggest pages had grown past a thousand lines: every
screen that needed one built it again inline.

### The front desk stopped working when the connection did

Sajek, Bandarban and the hill districts lose connectivity for minutes at a time
as a matter of routine. A front desk that cannot check a guest in because the
network dropped is worse than the paper register it replaced, and it is the
reason a resort keeps the register on the counter next to the software it pays
for. **No competitor selling into this market handles it.**

The three actions that cannot wait -- check in, check out, take money -- now
queue on the device and replay in order when the connection returns. Everything
else still requires a connection: a queue that accepts every write becomes a
second, worse database.

Replay is safe because payments carry their own identity
(`UNIQUE(bookingId, clientRef)`), so a replay of a request that actually
succeeded -- the common case, where the request landed and the response was lost
coming back -- returns the original instead of charging twice. And a repeated
state change is now *done*, not a 409, which was wrong even online: a clerk
double-tapping Check in got an error for doing nothing wrong.

### Guest payments, and two defects found on the way

The checkout intent worked out what a guest owes with its own arithmetic -- no
nights multiplier, no tax. **The same money defect, in a fifth place**: on a
two-night stay it let the guest pay half and told them they were square.

Worse, the webhook believed whatever was posted to it. `POST
/payments/webhook/:provider` took a reference and a transaction id from an
unauthenticated request off the public internet and wrote a payment row --
**anyone who guessed a reference could mark a booking paid.** The body is now
evidence of nothing: the gateway is asked what happened, and the amount it
reports is checked against the amount we asked for.

SSLCommerz is implemented behind that adapter -- one integration covers bKash,
Nagad, Rocket and cards -- and stays inert until a merchant account exists,
which is the owner's to open. Until then the mock gateway works exactly as it
did.

### An agency was a login, not a business

The agent side could sell a room and hold a wallet. That is a channel, not a
company, and a travel agency is a company: it sells trips rather than rooms, it
buys transport and food and guides to make one, it pays people, it quotes
clients and bills them, and it has a customer list of its own.

**What a tour is made of** is now the agency's own tree, to whatever depth the
way they buy actually needs -- Transport → Bus → AC, Food → Breakfast → set
menu. The platform ships no categories at all, because an agency running hill
treks and one running beach weekends do not buy the same things and a starting
list nobody asked for is a list everybody deletes first. A package is built by
picking leaves off that tree and pricing them, with **cost beside price on
every line**: an agency that cannot see its own margin while quoting finds it
out after the trip.

**Quotations and invoices are one table**, because an invoice is a quotation the
client said yes to. Converting carries every line across untouched -- nobody
retypes anything, which is where the numbers stop matching -- and the reverse
link means a document always knows where it came from. Converting twice returns
the same invoice, which a double-click, a retried request and a replayed offline
write all depend on.

The lines live on the document rather than on the package they came from, so
repricing a package next month does not rewrite a quote sent last month. A
client holding a number the system no longer agrees with is how an agency loses
an argument it should win.

**The client reads the document in the email**, not behind an attachment. An
attachment they have to download is one they mostly do not, and then an agency
cannot tell a lost sale from an unopened PDF. The same markup prints to PDF from
the browser, fetched with the auth header rather than a token in a URL, which
would land in history and logs.

**Expenses and payroll ride the tables the resort side already uses**, with an
agency as the owner instead of a resort. A resort paying its cook and an agency
paying its counter clerk are the same act, and two tables for it would drift --
the day they did, a bug fixed on one side would still be live on the other. What
makes that safe is that a row has exactly one owner and each side filters on its
own column; the tests that matter here are the ones proving neither side can
read or delete the other's rows even by guessing an id. Unlike the resort, an
agency defines its heads first and files under them, which is what makes a
head-by-head total possible at all -- free text produces "Fuel", "fuel" and
"Fuel " in the same report.

**A guest list, and a room search that spans resorts.** An agent asked "have you
got anything for the 12th to the 14th" was opening each resort in turn and
reading a grid, which is why the answer took a call back. And the guest list is
the *agency's*, counted across everyone on its team.

**A defect the agent portal left behind:** the booking list was scoped to the
person, not the agency, so an owner could not see what their own staff had
booked -- while, correctly, seeing nothing of any other agency's. The agency is
the unit; it is now the unit everywhere.

### Reading with no connection, not just writing

The outbox let the desk keep *writing* offline. Reading was still impossible:
open the app on a hill road and every screen was blank, because the in-memory
cache dies with the page -- the one moment last-known figures are worth most.

Every successful read is now kept in the browser and restored on the next load,
and a screen showing kept data **says how old it is**. Presenting stale figures
as current is worse than an empty screen, because the reader cannot tell. It
stays a cache and never becomes a source: anything past a day is dropped, the
store is capped so it cannot fill the browser's quota, and signing out empties
it -- the next person at that counter is not the last one.

**What may wait for a connection changed rule.** The first version queued three
actions on the grounds that they cannot be postponed. That was right about the
danger and wrong about the boundary: what makes a write safe to replay is not
urgency, it is *identity*. A write that creates a new row carrying its own
reference can be replayed all day and still make one row, so an agent writing up
a tour on the bus, filing the day's fuel, or drafting a quotation now keeps
working with no signal. An edit still needs a connection and says so plainly --
two devices editing the same row offline cannot both be right, and there is no
reference that makes them so.

### Smaller, but shipped

Per-tenant document prefixes · the guest directory's per-guest N+1 removed ·
wallet payments no longer mark a multi-night stay paid · mojibake repaired
across the repo including three strings guests actually saw (an invoice line
printed `Snorkelling <?> 2`) · idle inventory priced in taka on the dashboard ·
live passwords removed from the roadmap · phone normalisation no longer assumes
+880, and the SMS gateway no longer keeps its own second copy of that rule ·
the restaurant bill list pages instead of stopping silently at 300 ·
`resorts.settings`, a JSON column nothing ever read or wrote, dropped before it
became the junk drawer the next feature reached for · a `db:baseline` tool that
works out which migrations a `db push` database already has, instead of a
hand-written list that was already wrong.

## 4. What is left

P3, P4 and the SSLCommerz half of P5 are done; §3 describes them. What follows
is what is genuinely still open, ordered by the same rule: **a platform earns
money only when it can onboard a tenant without us, enforce its own terms, and
never promise what it does not do.**

### Next, and small

1. **Decompose the two large pages.** The missing primitives are the root cause
   and they now exist, but `settings/page.tsx` is still ~1,200 lines holding
   nine tab components and `bookings/page.tsx` ~800 with the modal, the drawer
   and the list in one file. Splitting them is mechanical and low-risk; it was
   left until last because file size is a symptom, and the disease was the
   missing primitives.
2. **More front-end tests.** There are 24, on the offline queue and the offline
   read cache, which is where the risk was. The money formatter, the
   permission-driven navigation and the outbox bar are the next three worth
   holding down.
3. **Mobile adopts the typed client.** It still hand-rolls nine interfaces, and
   none of the agency screens exist there. Nothing is broken; it will drift.
4. **Agency staff resort links are copied at hire time and never again.** An
   agency approved for a new resort has staff with no link of their own to it.
   The room search works around this by running on the agency's authority; the
   rest of the agent surface has not been swept for the same assumption.

### P5 — Growth, when the above is quiet

**A merchant account** turns the payment work on (§5 — owner only). **The
channel manager** is still deliberately unbuilt: see below. **The mobile
release** likewise.

### Deliberately dropped

**Chains as a segment** — built for a customer never met; keep multi-resort as a
capability, stop building for it. **OTA channel sync** and **embed themes** —
both assume a maturity the platform has not reached; the offline front desk was
worth more than either and is now the only thing in this market that does it.
**The mobile app release** — guests already book on the web, and the offline
work landed in the browser, so a native shell buys less than it did.

### Kept honest

Six list endpoints still return bare arrays. They are recent-activity feeds —
audit log, notifications, cancel requests — where a cap is honest and the caller
wants the last N. `fb.list` was the one a working resort actually reached inside
a year, and it now pages.

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
3. **Monitoring.** The API now writes one structured JSON line per request
   and per crash (§3), so there is finally something worth watching — but
   nothing is watching it. Anything that tails the log for `"level":"error"`
   and messages a phone will do.
4. **SSLCommerz merchant account.** The integration is written and tested; it
   is inert until `SSLCOMMERZ_STORE_ID` and `SSLCOMMERZ_STORE_PASSWORD` exist.
   Requires a trade licence, TIN and a bank account. Until then the mock
   gateway runs the whole flow, so nothing is blocked but real money.
5. **SMS sender ID** — the SSL Wireless adapter is written and dormant; only
   `SMS_SENDER_ID` is missing.

## 6. Deploying this branch

The live database was built with `db push` before migrations existed, so it
already has tables and columns that later migrations try to add, and
`migrate deploy` dies on the first one with *Duplicate column name*.

Do not follow a written list — this document had one, and it was already wrong.
Ask the database instead:

```
pnpm -F @rh/api db:baseline           # says what it would do, changes nothing
pnpm -F @rh/api db:baseline -- --apply
```

It reads each pending migration, works out what it would create, and asks
whether the database already has all of it: mark applied, let deploy run it, or
— the case that matters — partially present, which it refuses to touch and
hands to a person. Run against the development database today it finds **six**
migrations already there, not the one this document used to name.

**Two behaviour changes to expect, and to say out loud before anyone notices
them on their own:**

- **`/reports/daily` numbers move.** The old figures were wrong — no nights
  multiplier, no discount, F&B double-counted — so the new ones are correct.
- **Billing starts happening.** The hourly sweep is live from the first boot:
  trials that have already expired end, renewals that are already due raise a
  bill, and a tenant far enough past due is suspended. Look at
  Platform → Billing policy and Platform → Dues *before* deploying, and run
  the sweep by hand from that screen so the first one is watched.

## 7. Working on it

```
pnpm install
pnpm -F @rh/api test:setup     # creates resorthub_test and migrates it
pnpm -F @rh/api test           # 223 tests against a real MySQL
pnpm -F @rh/web test           # 11 tests, jsdom
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
