# Resort Mela — where the project stands

*Last updated 2026-09-11. This is the entry point: read it before the other
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

Current state: **729 API tests** across 73 files (34 at the start of all this,
all of them pure unit tests) plus **117 front-end tests**. Four packages
typecheck clean — the fifth, mobile, is deliberately frozen out of the pipeline
(§3.27) — the console builds, and the repository can be provisioned from an
empty database, which it could not before.

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

One `common/money.ts` now. *Every caller* was overstated — see §3.24, which
found four more that were still doing their own arithmetic, and a defect inside
the shared function itself.

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

**Superseded 2026-09-11.** OTP login was removed entirely, not merely
hardened — see §3.32. Nothing mints or reads a code any more.

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

*That was the write surface only, and the sentence did not say so.* Eleven
**view** permissions were still asking nothing at all, and three more endpoints
were gated on the role enum or on nothing — see §3.25.

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

### The words that mattered were still in English (and see the note below)

The words still in English were the ones that matter most: the state of a
booking -- rendered as the raw enum with its underscore swapped for a hyphen,
`CHECKED-IN` -- the button that takes a guest's money, and the message shown
when something breaks at 11pm in Sajek. 108 keys now, and the dictionary is
typed so a key added in English and forgotten in Bangla fails the build rather
than falling back silently in front of a customer.

**Withdrawn, 10 Sep.** The owner's direction is that **English is the default
and Bangla is the translation**, not the other way round — which the code has
always done (`DEFAULT_LANG = "en"`). So "eighteen screens carry no translation
key" is not a defect: those screens are in the default language. Bangla
coverage is a feature to extend when it is wanted, not a gap to close, and the
"Bangla-first" framing in PLAN-v2 §56 and STRATEGY §D10 no longer describes
this product.

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

### Six more things the software had decided on its owner's behalf

A sweep for invented business data, prompted by a fair question about whether
the tour tree shipped with categories in it. It does not — the tree starts empty
and a test holds it there. Six other things did.

**The restaurant screen came with a menu.** Lunch 300, Dinner 350, Breakfast
200, as one-tap buttons, and the bill opened with "Lunch, 1, 300" already typed
in. Three invented dishes at three invented prices: a resort selling lunch at
500 had a clerk deleting 300 and typing 500 on every bill, until the day they
forgot. What the kitchen sells is the resort's own food packages, which that
screen already listed beside the fakes.

**Email credit packs were written out three times** — in the console, in the
request validator and again in the service — and the *prices* existed only in
the console, as strings. So the platform could not change what it sells without
a deploy. Worse, the console showed a price and the server took no money: click
"৳1,800 for 2,000 credits" and you were granted 2,000 credits, free, with no
record anywhere of the amount owed. A disclaimer did exist, in grey micro-text
under the bold price, which is where a disclaimer goes when nobody wants it
read. Packs are platform settings now, the price lands in the audit row so it
can be invoiced, and the screen says plainly that nothing is charged yet.

**The homepage claimed 99.9% uptime.** Nobody has ever measured uptime. The
other three figures — "89+ bookings managed", "৳1M+ revenue tracked", "10+ rooms
per resort" — were the demo database's. They are CMS keys now like the rest of
the homepage, and the shipped defaults are claims that can be shown to be true:
a room cannot be sold twice because a unique index forbids it, and the revenue
figures were checked cell by cell against a manager's own register.

**Ten input labels said "৳"** while the value beside them was formatted in the
resort's own currency. `cur()` had existed in the console since the money
formatter landed, and nothing called it.

**The guest app stamped "Tk" on every figure**, because the public API never
said what currency it was quoting — a resort keeping books in dollars had its
rates shown to guests in taka: the right number, the wrong money, and nothing on
either side that could notice. The resort already carried a currency; it just
was not being sent.

**Signup wrote its own copy of the schema's defaults** for timezone and
currency, which is a second place to change when a resort outside Bangladesh
signs up, and the one nobody would remember.

Two things were looked at and deliberately left. The legacy `PLANS` table is a
documented fallback for tenants with no subscription, not a hardcoded price
list. The importer names a room type "Standard" when a resort has none, because
rooms must attach to something and `maxAdults` is displayed rather than
enforced; it is one click to rename.

### The three things the last sweep left behind

**There were two plan tables, not a plan table and a fallback.** The earlier
note called `PLANS` a documented fallback. Looking properly, it was a second
vocabulary: the code held FREE / STANDARD / PRO with limits of 10 / 50 / 500
rooms, the database held STARTER / GROWTH / CHAIN with 10 / 40 / 10,000, and
`PlanLimitsService` silently chose between them. Signup put every new tenant on
"FREE" — a name that did not exist in the plan table at all — so a new
customer's limits lived in a constant nobody could change without a deploy. And
the super admin's own plan-change screen refused every plan the platform
actually sells, because it validated against the code list.

The database is the vocabulary now. The legacy names survive as *inactive* rows
carrying exactly the limits they always had, so no existing tenant's capacity
moves by a single room: remapping STANDARD onto GROWTH would have taken ten off
every tenant on it. The entry plan comes from the price list rather than a
string in the signup code, and the constant is gone.

**The importer stopped inventing a room type.** A spreadsheet import into a
resort with no room types created "Standard, two adults, no children" and said
nothing, so a resort importing family cottages had its whole inventory typed as
a double. The import screen asks now, with the old invention prefilled — the
fast path is still one keypress — and when it does have to name the type
itself, the report says so, because the old one did it silently and nobody knew
there was anything to correct.

Two more things fell out of that. The F&B importer could not match a sheet that
wrote the room's actual name, only one that needed a translation map — and the
console papered over it by shipping **one specific resort's map**,
`{ "3": "Snow Drop" }`, sent by every customer on every import. Names match
directly now, and the map is back to being the escape hatch it was meant to be.

**Email credits have a ledger.** They were granted and the price went into an
audit row, which is a record but not a ledger: the platform had to read the log
to find out who owed what, and nothing could mark a charge settled.

`SubscriptionDue` could not take them. Its `UNIQUE(subscriptionId, periodStart)`
is the only thing making the monthly billing sweep idempotent, and a second
credit pack bought in the same month would collide with the first — so fitting
one-off charges in would have meant trading recurring billing's one guarantee
for a convenience. `PlatformCharge` carries its own idempotency instead: the
identity of the purchase. The grant and the charge are one transaction, because
credits with no charge behind them is the platform giving its product away and
never knowing. Platform → Dues shows both, and "what does this tenant owe" is
one number again.

### What a real server found that 360 tests did not

This branch was deployed to the live server on 9 Sep. Four things only a real
deployment could have found, in the order they bit.

**The database had never had a migration run against it.** It was built with
`db push`: 38 tables, no `_prisma_migrations` table at all. `migrate deploy`
would have started at `init` and tried to `CREATE TABLE` things that already
existed. `db:baseline` is exactly the tool for that — it marked nine migrations
applied without running them and left nineteen to run.

**A migration that only drops things.** `db:baseline` classified every
migration that creates nothing as "data-only, so it must run" — but
`20260827163511_guest_phonekey_index` only drops a unique index, and `db push`
had never created that index. The DROP failed, and a failed migration blocks
every migration behind it. The tool asks the mirror question now: for a
migration that only drops, are those things already gone? If so the database is
already where the migration was trying to get to.

**The server is MariaDB, not MySQL 8.** `CAST(... AS JSON)` is a syntax error
there — MariaDB has no JSON type, and Prisma maps `Json` to `longtext` — so
`split_activity_permissions` failed six migrations in. The cast bought nothing
even on MySQL, which parses a valid JSON string on assignment to a json column.
Local development runs MySQL, which is why every migration passed here and one
failed there.

**The API would not boot.** `IntentsService` declared its payment gateway as a
constructor parameter typed with an *interface* and gave it a default value.
Interfaces do not exist at runtime and Nest resolves every parameter itself
rather than falling back to a default, so it injected `undefined` and the whole
application refused to start. 360 passing tests, a clean typecheck and a
successful build, and the API was dead — because every test in this suite
builds its services by hand and nothing had ever asked Nest to wire the real
module graph.

`test/integration/app-boots.spec.ts` asks it now. It builds the real
`AppModule`, closes it, and fails in about four seconds when a provider is
missing — verified by removing the provider again and watching it reproduce the
production error exactly. **Run it before any deployment.**

Live state after all that: 97 bookings, 33 guests and 25 payments unchanged,
38 tables became 50, all 28 migrations applied, `migrate status` reports the
schema up to date. A verified dump was taken first and sits in `/root/backups`.

### A resort's books were open to every agency that sold it

Someone outside the project suggested the agent portal could show a resort's
calendar, and added the caution that an agent should not see other people's
booking details. The first half was a feature. The second half was already
broken.

Approving an agency writes a `user_resorts` row, and login turns those rows into
the token's `resortIds` — the same list a manager's own resorts arrive in. So
`requireResortAccess` could not tell the two apart, and **twenty-seven service
methods had that check and nothing else**: the calendar with every guest's name
on it, the guest directory with phone and NID numbers, the day sheet with each
booking's outstanding balance, the revenue reports, the dues list, the resort's
expenses, the restaurant's in-house covers, the API-key list. A booking could
also be read by id — including the invoice, which carried the guest's full name,
phone, NID and email unmasked, for any booking in the resort.

None of it was reachable from the console: agents have no `bookings.view`, so
those links are hidden. But the console is not the security boundary. A token
and curl were enough, and on the live server two approved agents could reach
thirty-three guests and ninety-seven bookings that were not theirs.

The fix is a changed default rather than twenty-seven patches. A link now means
an agent may **sell** a resort, and the five paths where selling is genuinely
enough — the availability grid, creating a booking, listing and opening the
agency's own bookings, the agency's own commission report — say so by calling
`requireSellingAccess` by name. Everything else closed without being touched,
which is the point: the next endpoint someone writes is closed too, and opening
one is now a decision with a name on it rather than the silent consequence of
two ideas sharing a list.

Opening a booking by id gets a second question, because "may you be at this
resort" was never the same as "is this row yours". `requireOwnBooking` asks the
agency, not the individual — an owner can open what their staff booked, and
nothing of the agency next door.

`agent-visibility.spec.ts` holds both halves: eleven doors that must stay shut,
and four that must stay open, because an agency that cannot search for a room
cannot work. Those four passed before the change as well as after, which is how
the closure is known to have cost nothing.

### The calendar an agency is allowed to see

Then the feature. `/agent/calendar` draws the month as a grid — rooms down,
nights across — over every resort the agency sells.

A night the agency sold is theirs in full: guest name, booking code, and the
booking a click away. A night anyone else sold is a grey block and nothing
more — no name, no code, not even which agency it belongs to. The resort down
the road sells to the same agencies, and a calendar with names on it is a
customer list with a date attached.

A resort that wants to be more open can be: `showGuestNamesToAgents` sits beside
`showRatesToAgents` in the resort's own settings and labels the other blocks
too. It is off for every resort until someone turns it on, which is the part of
the design worth stating plainly — the safe answer is what you get without
deciding anything, and the open one costs a deliberate act by the resort that
owns the data.

Cancelled and no-show stays are left off the grid entirely: those rooms are free
again, and drawing them as taken would lose the resort a sellable night. The
range is capped at a quarter, which is longer than anyone plans a group over and
short of pulling a resort's history through a screen that shows one month.

Clicking a free night opens the booking form with that resort, that room and
that date already in it — which is where a second defect turned up. The room
search's "Book here" sent `from`/`to` while the bookings page read
`checkIn`/`checkOut`, so an agent who had just picked their dates arrived at an
empty form. Worse, `resortId` was never read at all: an agent whose active
resort was A could search resort B, click Book here, and get a form for A with
nothing on screen saying so — a booking at the wrong hotel. Reading the URL is
now one tested function, `lib/booking-handoff`, which accepts both spellings of
the dates and switches the active resort to the one that was clicked.

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

### §3.23 — An audit of the resort panel, and what it found

The agent-visibility work above started from one remark by someone outside the
project and turned up twenty-seven leaking methods. That raised an obvious
question — what does a deliberate look find? — and this is the answer: a full
read of the console, the API, the schema, the billing layer and the mobile app,
with every serious claim opened in the code and checked.

**The finding that orders everything else: almost every dangerous defect was in
tenant isolation.** Which is to say, in the one area that is harmless while
there is a single customer and becomes a breach on the day there are two. They
were not reachable *by* anybody because there was nobody to reach them. Growth
is what arms them, so they had to be closed before growth, not after.

### §3.24 — One tenant's data stops at that tenant

`tenant-isolation.spec.ts` seeds two tenants, which no test had done for the
resort surface: `second-tenant.spec.ts` proves a second resort can be
*configured*, never that its data stays its own.

- **The notification list had no resort filter**, and its controller checked
  only the caller's role. Every tenant's admin could read every other tenant's
  guest correspondence — `NotificationJob.payload` carries the guest's name,
  their booking code and what they owe.
- **A campaign asked "may you send" about the caller's first resort and "send
  to whom" about the request body**, and never compared them. A manager could
  name another tenant's id and mail that tenant's entire guest list, From-named
  as them. The test watched it happen: the red run printed the delivery to the
  other tenant's customer.
- **Booking edit took `roomIds` on trust.** A clerk could attach another
  resort's room — reading its rate, and writing `booking_nights` against it,
  which turns the unique index that stops double-selling into a way to block a
  competitor's inventory. `create()` had always scoped this; the edit path
  never did.
- **Adding an activity to a booking never checked the slot's resort.** The
  guest app had always asked; only the staff path did not.
- **`phoneKey("")` is a constant**, and the desk writes it for any walk-in
  taken without a number — so a user who signed up by email, whose `phone` is
  null, matched every phone-less guest row on the platform and was handed all
  of their stays. The same bug, spelled with a raw `phone` compare, passed the
  ownership check in the payment flow.
- **An agency reached `resorts/:id` legitimately and got the whole row**: tax
  rate, address, contact phone, guest and booking counts, and every room's
  `baseRate` even with `showRatesToAgents` off. The gate was right; the
  projection behind it was not.
- **`updateResortUser` writes the global `users` row** and only ever checked a
  link to *this* resort, so a `users.manage` holder could reset the password of
  someone who also works for another tenant. It also accepted `RESORT_ADMIN`,
  which `createResortUser` refuses — and that role resolves to `["*"]`.
- **Approving an agency's access request rewrote that person's global role**,
  demoting someone who manages another resort, and silently lifting a platform
  suspension.
- **The audit log's delete skipped the resort check for platform rows** — the
  tenants created, plans changed and owners impersonated — and asked for
  `activities.delete`, which is not a permission that exists, so the guard was
  really "are you an admin". Deletions now write their own row.
- **The mock gateway's confirm route settled an intent from a reference in the
  URL**, behind AuthGuard and nothing else, mounted whatever gateway was
  configured. Any signed-in user could mark any booking paid.
- **A CSV upload gave out keys.** The importer matched the sheet's agent name
  against every user on the platform by substring, fell back to `candidates[0]`
  of any role, and created a `user_resorts` row for them — and login turns
  those rows into a token's `resortIds`.
- **The CORS allow-list was a suffix test.** `/resortmela\.app$/` matched
  `https://evil-resortmela.app`, with `credentials: true` behind it. It is a
  tested function now.
- **The rate limiter was global, not per caller.** `req.ip` with no
  `trust proxy` means every request behind the reverse proxy shares one
  address, so one client could lock everyone out of login. It also covered
  `auth` alone, leaving the webhook, the guest app and the public API unmetered.

One of those tests passed on its first run. It was wrong: the fixture's booking
code was thirteen characters against a twelve-character column, so the
assertion matched a truncated string. **A test that is green before the fix is
a test to go and read.**

### §3.25 — Money, and the claim that it was already fixed

`bookingTotals` computed `refunded` and then dropped it. `due` was
`total - paid`, so **a stay refunded in full still read PAID with nothing
outstanding**, and every report counted the returned money as collected. The
test that existed pinned how a refund is *represented* and never asked what it
*means* — which is how the defect survived in the one file the product treats
as the source of truth for money.

Three callers were still doing their own arithmetic:

- **`rangeBookings`** — feeding the dashboard metrics, the agent report, the
  source mix and an agent's own commission report — had its own nights
  multiplier, its own `paid` that dropped refunds, and `due = rent - discount -
  paid` with no tax. Every one of those disagreed with the booking screen for
  any resort that charges tax.
- **The agent payment-deadline alert** had no nights multiplier at all: a ROOM
  item carries one night at qty 1, so a five-night stay was reported to the
  owner as one. "This agent owes ৳5,000" on a ৳25,000 booking, in the alert
  whose only job is to say what is outstanding. There were two copies of it;
  the second had no caller and is deleted.
- **The guest's own balance** was computed without `taxRatePct`, so the figure
  in their SMS excluded tax while the invoice included it. No test in the suite
  sets a non-zero tax rate on that path, which is why nothing saw it.

Left alone on purpose: **agent commission is taken on rent before discount.**
That is a commercial term, not a defect, and it is the owner's to decide.

### §3.26 — The permission matrix, the rest of it

Eleven **view** permissions — `bookings.view`, `guests.view`, `payments.view`,
`expenses.view`, `rooms.view`, `restaurant.view`, `activities.view` and the
rest — were in `ALL_PERMISSIONS` and on the Settings screen, and `perms.require`
was never called with any of them. Every read endpoint was gated on resort
membership alone. Unticking "View guests" for the front desk removed the menu
link and nothing else: the clerk still had the guest directory, the dues
ledger, the calendar and the day sheet, with a token and curl. **A hidden link
is not access control.**

Three more were worse than unused. `bookings.update` — dates, rooms and the
**discount** — asked for nothing, while `create`, `softDelete` and even adding
an activity each asked for theirs. `transition` asked the fixed role enum,
which lists FRONT_DESK as a valid CANCELLED actor, so unticking "Cancel
bookings" changed nothing; the dedicated `cancel()` path does check, and the
console has never called it. And `metrics`, `daily` and `idleInventory` asked
for nothing while the five reports beside them asked for `reports.view`.

`permission-enforcement.spec.ts` holds both halves. Reverting the source and
leaving the spec in place fails exactly the eleven closed doors and passes the
three that must stay open — which is how the closure is known to have cost
nothing.

### §3.27 — Two decisions the documents had already made

**The homepage quoted its own price list.** Three names and three prices in the
markup while `platform_plans` was the editable source — a third copy of the
plan vocabulary, one commit after two copies were reduced to one. It reads
`GET /cms/plans` now, active rows only, so retiring a plan takes it off the
page. STRATEGY.md D4 (per-room pricing) remains open: `platform_plans` has
`monthlyFee` and no per-unit dimension, and that is a schema change and a
commercial decision.

**The mobile app is frozen** — out of the turbo pipelines, nothing deleted,
`apps/mobile/FROZEN.md` saying why. Both STRATEGY.md and STATUS.md had already
deprioritised it; the repository kept paying for it anyway. Reading it makes
the case stronger than the documents did: no `android.package`, no
`ios.bundleIdentifier`, no icon — it has never been built once — no push, no
offline, no Bangla, and nine hand-rolled interfaces duplicating the typed
client.

### §3.28 — On writing "fixed" in this document

Three claims in the sections above were falsified by this pass, and they are
corrected in place rather than quietly. None was written dishonestly; each was
written at the moment of the fix and never checked again.

The lesson is cheap to act on: **a claim worth putting in this document is a
claim worth putting in a test.** "Every resort-scoped method checks a
permission" is not a sentence, it is an assertion that can enumerate the
methods. `agent-visibility.spec.ts` was the only claim from the last pass that
survived contact with this one, and it is the only one that was written as a
spec.

### §3.29 — Finishing the resort panel

The audit in §3.23 produced about seventy findings and §3.24–§3.26 closed the
ones that lose other people's data or money. This is the rest of it, done in one
pass on the owner's instruction, and organised by the two questions that
actually matter for this product:

**Can a wrong state exist?** Five could, and now cannot — each enforced where it
cannot be argued with rather than remembered by a service. `Guest` had no
uniqueness on its own dedup key, so two bookings at one counter split a guest in
two; adding the index immediately exposed the read-then-write race behind it,
which is the index doing its job before it was even committed. A phone-less
walk-in was keyed on a hash of their *name*, so every guest called "local" was
one row owning hundreds of unrelated stays. `Booking.invoiceNo` was not unique
next to a `code` that always has been. `Expense` had the offline replay guard on
the agency side and not on the resort side, which is the side that goes offline.
Four tenancy columns had no foreign key. And a resort could hold two live
subscriptions — a plan change restarted the free trial and billed twice a month
— which is now a generated column the application cannot write.

**Can the owner change it without a deploy?** Three enums that described a
business rather than a program became the resort's own lists, in one table so
the next one costs a registry entry. Tax stopped being a single percentage and
became rules — what each is charged on, whether it is inside the price, whether
it stacks — which is the only shape that can express 15% VAT plus a 10% service
charge that VAT is then charged on, plus a restaurant at its own rate, plus a
menu price quoted gross. The restaurant could not carry tax at all before. And
the last hardcoded things went: two rival plan vocabularies, a fee map beside
the plan table it had already fetched, the agent deadline's three permitted
numbers, an API example pointing at one specific server, and signup describing
a plan it does not assign.

**Dates.** `new Date().toISOString().slice(0, 10)` is today in UTC and the
console said it seven times over. Bangladesh is UTC+6, so from 18:00 every
default date was tomorrow — the day sheet, the expense register, a new booking's
check-in. `Resort.timezone` had been in the schema all along and the console was
never sent it.

**Screens that were saying something untrue.** The financial-year picker looked
its own options up by the wrong field and reported all time. Two selects sent
their label instead of their value, so three booking states and every activity
category were wrong. The public booking form sent `adults: 2` hardcoded and
never asked. "Wallet on" sent the same body as the button beside it. Booking
search filtered the hundred rows already fetched, under a footer admitting it
was hiding the rest. The agent's own earnings page recomputed commission as a
percentage, so flat-fee agents saw a number nobody agreed to.

**Reports.** The P&L skipped February — `setUTCMonth(+1)` from a 31st lands on 3
March — and charged whole months of payroll to part-month ranges. The collectors
report totalled 300 rows and presented it as the answer, on the one report an
owner opens to ask where the cash went.

**And screens that lied by omission.** Fourteen `.catch(() => setRows([]))`
turned every failure into "nothing here"; four destructive actions fired on one
click, including a bulk email with no preview and no recipient count.

### §3.30 — Five things the owner asked for

A list of ten, handed over as things that ought to exist. Five already did —
resort roles with a permission matrix, extra-person pricing on the room type
and on the booking form, and food packages in the restaurant. These are the
five that did not, in the order they were worth doing.

**The subscription the owner could not see or change.** The console had one
plan control and it was on the super admin's side of the wall: hidden from the
owner, and writing `Tenant.plan` — a field the billing sweep does not read.
Pressing it changed a label while the fee, the renewal date and the status
stayed where they were. There was nothing to *read*, either: what am I paying,
when does it renew, what is outstanding, what would the next plan up cost me —
the console answered none of them for the person being billed, on a product
that invoices monthly.

A Subscription tab answers all four and moves plan under two rules. An upgrade
applies at once and bills only the **difference**, only for the days left in
the period — a full month would bill the month twice, nothing would give the
dearer plan away until the renewal. A downgrade waits for the renewal, because
the month is already invoiced; the request parks in `Subscription.pendingPlan`
and the billing sweep applies it in the same pass that raises the first bill at
the new price. The renewal date never moves either way — a plan change is not a
renewal — and a change inside a trial is free, immediate, and does not hand out
a second trial. `billing.view` and `billing.manage` separate reading the bill
from spending money on it.

**Commission belonged to the agent, not the resort.** `UserResort.commissionRate`
was typed in per person, so two agents selling the same room could earn
different money on it, and no screen anywhere listed the rates side by side —
"what do we pay agents" was a query, not an answer. It is the resort's term
now: one number, set by hand, on Settings → Agent access. The migration seeds
each resort with the terms most of its agents were already on, so nobody's pay
changes on the day it deploys, and ties break generously rather than quietly
cutting someone. Six call sites read the agent's own row — booking detail, room
availability, the owner's agent report, the agent's own report, the agency room
search, login — and one service answers now. The old columns stay, holding what
each agent used to be on; the export relabels them `formerCommission` so nobody
reads them as live.

**A room could be created and never removed.** There was no DELETE route at
all, so a room typed in by mistake stayed on the calendar and in the plan's
room cap for ever, and `OUT_OF_SERVICE` means something else — temporarily
unsellable, still inventory. The distinction that matters is whether the room
has ever been sold. Never sold: it was a mistake, it is deleted, its name is
free again. Sold: it is finished, not a mistake, and deleting it would take the
rooms out of last year's bookings and invoices — `booking_items.roomId` is the
database saying so — so it is **retired**: off the calendar, out of the cap,
history intact. A room with a stay still to come is refused either way, because
removing a room from under a booked guest is not a thing to do quietly.
Fifteen room queries across nine services learned the difference. `rooms.delete`
is its own permission: editing a rate and taking a room off the books are not
the same authority.

**Selling mail with no gateway.** There is no merchant account, so an email
pack is paid for by hand — bKash, a bank transfer, cash — and **approval is the
receipt**: the platform confirms once the money has landed. That rule made two
more things wrong. The charge was raised as DUE even though the money was
already in the owner's hand, so the platform's outstanding figure counted it
and the pack had to be found in the Dues tab and settled a second time; it is
settled at approval now, carrying how the money arrived, and the console offers
no other path. And the buyer was shown a price and a button and told nothing
about where to send the money — `platform.paymentInstructions` is on the screen
they buy on.

The price list had a worse problem. It was always a platform setting, correctly,
but `platform_settings.value` is VARCHAR(255) and `updateSettings` sliced to 255
before writing. A list of more than about eight packs was cut mid-JSON, and
`parseCreditPacks` — which falls back rather than throws, which is right at read
time — then quietly sold at the **shipped** prices while the console reported
the save as successful. The column is TEXT, nothing is truncated, a value too
long is refused, and a JSON setting is now parsed at the moment it is saved
rather than at the moment it is needed. There was also no editor for it
anywhere in the console: changing what the platform sells meant a raw API call,
so in practice it never changed. Platform → Email credits is that editor.

**Buying email credits charged the tenant with one click.** The button granted
the credits and raised a billable `PlatformCharge` in the same call, with no
confirmation of any kind — the only confirm on that screen guarded *sending*.
A misclick on the largest pack was a charge of that size, and a resort could
raise unlimited charges against itself with nothing in between. A request
queues an order now and does nothing else; approval by a super admin is the
single moment credits are granted and the charge raised, in one transaction,
because credits with no charge behind them is the platform giving its product
away and never knowing. The price is written down when the order is placed, so
what was quoted is what is charged however the price list moves. Platform →
Email credits is the queue.

**Reports were one long scroll.** Six of them stacked down a page, so reading
the third meant scrolling past the first two. They are not a sequence. A tab
each, one period picker above them all, and the three expensive reads wait
until their tab is open instead of firing on every page load.

**And a role that had been going stale since the day each resort signed up.**
Adding two permission keys exposed it: `ensureResortRoles` writes
`ALL_PERMISSIONS` into the Administrator role when a resort is created and
never runs for that resort again, so the list is a snapshot. Every key added
afterwards was missing from it, invisibly — a resort that signed up last month
had an Administrator role that had never heard of `billing.manage` or
`rooms.delete`, and the matrix simply had fewer boxes than the product had
features, drifting further with every release. Administrator resolves to `*`
now, computed rather than stored, so it cannot rot; the matrix stops offering
boxes that decide nothing, and a role somebody names "Administrator" themselves
is still an ordinary role holding exactly what it says.

**And a test helper that had been quietly lying.** `resetDb` truncated a
hand-written list of tables. The list drifted the moment a migration added one:
`email_credit_orders` arrived and eleven rows from earlier tests survived into
the next, so specs that counted rows passed or failed depending on what had run
before them. It asks `information_schema` now. A list that has to be edited in
step with the schema is a list that will be wrong — the same lesson as §3.28,
one layer down.

### §3.31 — The calendar, the guest, and a plan that means something

Four pieces of work, and the thread running through them is the same one: a
screen was saying something the software did not do.

**The calendar was showing cancelled stays as occupied rooms.** `calendar()`
filtered on nothing, so a cancelled booking still painted its nights — the one
screen the front desk trusts to say what is free was hiding rooms it could
sell. Fixed, then rebuilt: a stay is one bar rather than one box per night,
four states have four colours, and money is a stripe under the bar rather than a
second grid to read.

Then it was opened in a browser, and three faults appeared that types, tests and
the build had all passed. Merging free nights — done in the previous commit and
called an improvement — destroyed the column grid: a room with nothing booked
became one pale fortnight-wide band, so the table stopped lining up with its own
header and there was nothing left to click. Day columns were unequal, because
`table-fixed` shares surplus width proportionally when every column has one.
Out-of-service rooms sat interleaved among the sellable ones. **Two of the three
were decisions made in the previous commit, and no test could have caught any of
them.**

**A guest cannot book directly.** A business decision, and the code said the
opposite in as many words: `bookings.create` refused a guest with "Guests book
via the mobile app flow (phase 4)". The desk's door was shut and the app's door
was the open one — and that flow went straight to `bookRoomsTx` with state
PENDING, which blocks. A stranger with a verified phone could take a resort's
rooms off the market without anyone at the resort being asked.

Both doors refuse now, including the public v1 API: a booking form on a resort's
own website is a guest booking directly however it reaches us, and
`apiKeyClaims` records that nobody at a desk pressed anything. They refuse
rather than 404 because the mobile app is frozen and still has the button.

**Superseded 2026-09-11.** Phase 1 (§3.32) removed the doors this section
describes refusing — the guest API, `/v1` and `apiKeyClaims` among them —
entirely. What answered 400 here now answers 404, including for the mobile
app's own Book button.

Which exposed the real cost of the decision. `resortDetail` returned rooms,
prices and activities and no way to reach anybody, so "call the resort" would
have been a dead end. It carries a phone number now.

**A plan is a list of features, and the owner writes it.** The Plans tab offered
two boxes — fee and room cap — on three rows seeded in code. Trial length,
resort limit, label, blurb, order, whether it was still on sale: none of them
reachable, and no way at all to add a fourth plan or retire one. Every pricing
decision was a deployment.

Worse, the ticks on the pricing cards were a map in the homepage keyed by plan
name. A plan the owner created matched no key and rendered with no features at
all — and no line on any card gated anything, so a Starter customer whose card
never mentioned the restaurant could use it all month.

One vocabulary now, three readers: `PLAN_FEATURES` in `@rh/shared` is the shelf,
`platform_plans.features` is what each plan takes off it, and the public card,
the panel's checkboxes and `requireFeature` all read the same list. Eight
features are gated — restaurant, agents, activities, discounts, bulk email,
public API, payroll, spreadsheet import — and a test walks `src/` and fails if
any declared feature has no gate. Selling a lock with no door is worse than
selling no lock.

**One rule decides who is exempt, and it is the important one.** A resort with
no subscription is not a downgraded customer, it is an unbilled one. Every
resort in the live database is in exactly that state, and one of them runs a
restaurant with 24 bills in it, so a lock that bit on the fallback plan would
have taken a working module from a paying customer on the morning it deployed.
Locks follow a subscription, because a plan is something you sold somebody.

**And the trial is the owner's, including none.** A plan selling zero days
produced a TRIAL whose end date was already behind it: the money was right, but
the customer's own page said TRIAL until the next hourly sweep. Zero now starts
them ACTIVE and bills from today. A single resort can also be given different
terms from the plan's, which the fee could always do and the trial could not.

**A super admin could not open the console at all.** Found by opening it. The
layout gate was `loading || !me || !activeResort`, and the platform owner has no
resort — that is the role. They sat on "Loading…" for ever, locked out of the
one screen only they can use. The gate has four answers now, and staff whose
resort link was removed are told so instead of watching a spinner.

**And the menu had to learn the same answer.** Gating the API is not enough on
its own: a resort on a plan without the restaurant still saw "Restaurant" in the
sidebar and met a 403 on arriving, which is the defect §3.26 named, in the other
direction. `/auth/permissions` returns two lists now — what the owner gave this
person, and what the plan includes — because it is one question asked when a
resort loads, and both go through the same `effective()` so the menu and the
door cannot come to different conclusions.

Doing that exposed a wrong question in the gate written the day before. Bulk
Email is shared between a resort's management and its agents, and an agent's
copy writes to the agency's own guest list, wherever it booked them. Asking a
resort's plan whether an agency may mail its own list is not a stricter rule, it
is the wrong rule; the gate now applies to the resort's own audiences only, and
the sidebar draws the same line.

Hiding a link is still not the whole job — a typed URL or an old bookmark opens
the screen anyway — so the layout says once, above the page, which feature is
missing. **Reads stay open.** A resort whose plan no longer includes the
restaurant can still read the bills it took while it did: locking creation is the
sale, locking history would be keeping their own books from them.

**What this leaves open.** There is no per-resort feature override to match the
per-resort fee and trial, so a customer who needs one extra module needs a plan
that has it.

### §3.32 — Guests leave: phase 1 of a two-customer platform

On 2026-09-11 the owner settled a question that had been half-open for weeks:
**Resort Mela sells to resorts and to travel agencies, and nobody else has an
account.** A guest is a row in a resort's register, not a login. The decision
and the five-phase plan it produced are recorded in
`docs/superpowers/specs/2026-09-11-two-sided-platform-design.md`; this section
covers phase 1, `docs/superpowers/plans/2026-09-11-phase-1-guests-leave.md`,
executed as nine tasks on this branch.

**Removed, not merely gated.** The guest API (`apps/api/src/guest/`, ten
endpoints), the `/v1` resort-website API and the API-key claims it minted,
guest online payment (`payments/intents.*` and the payment gateway adapter —
the mock gateway and the SSLCommerz integration that never had a merchant
account both went with it), phone/email OTP login and the `GUEST` role it
minted, the `OtpCode` table, and the web guest pages (`/book`, `/book/trips`,
`/book/[id]`) with every link to them. `a-guest-has-no-door.spec.ts` walks
every one of those doors over a live, booted `AppModule` and shows a 404 where
a 401/400/200 used to answer — proving the handler is gone, not merely
guarded — and shows the guest module cannot even be imported any more.
`book-doors-are-gone.spec.ts` reads the whole `apps/web/src` tree and fails the
moment a `/book` link or a `guest*`/`/v1` call reappears anywhere in it, naming
the file and line.

**Two things needed building or preserving, not just deleting, so the removal
did not silently take something else with it.** `public-api.controller.ts`
declared the resort-website API beside the platform's own `/cms/plans` — the
same rows the homepage's pricing cards read — so deleting the file outright
would have taken the platform's own shopfront down while closing somebody
else's door. The CMS half moved to `marketing.controller.ts` first;
`the-pricing-page-still-has-prices.spec.ts` proves the homepage's price list
still answers after `/v1` is gone.

OTP was never only a guest door: `verifyOtp` minted a token for whatever role
an identifier already had, so a manager with a phone number could sign in with
a code instead of a password — the only account recovery a locked-out staff
member had, because there was no forgot-password flow. Removing OTP without
replacing that would have removed a working capability as a side effect.
`PasswordResetService` replaces it: a single-use, short-lived, emailed token
that can only reset a password for an account that already exists — it mints
nobody. `a-password-can-be-reset.spec.ts` proves the actual emailed link works,
by lifting the token out of the stubbed outbox the way a recipient would click
it, rather than through a test-only method that hands one back.

`guests-do-not-book.spec.ts` re-proves the rule the deleted `ROLE.GUEST` check
used to stand in for — a room is held only by a resort's own desk or by an
agency selling on its behalf — including through a `GUEST`-role session token
signed before this deploy: `AuthGuard` now refuses any token whose role the
platform no longer holds ("This sign-in is for a kind of account the platform
no longer has"), so a session minted the day before the deploy does not outlive
the account it was issued to by riding out its unexpired seven days.

`a-plan-that-locks.spec.ts` proves `public_api` is gone from `PLAN_FEATURES`
and every plan row, and that `createApiKey` mints no key on any plan — there is
no `/v1` left for one to open. `listApiKeys` and `revokeApiKey` still work and
`api_keys` keeps its rows, on the owner's decision to leave a resort-website
integration room to return to rather than delete the shelf it would stand on
(spec §4.3).

The mobile app is not merely frozen any more — it is formally retired
(`apps/mobile/README.md`; `FROZEN.md`'s "if it comes back" section now says its
endpoints are gone). Its code is untouched, and the shipped build's own Book
button now meets the same 404 wall a browser does, in place of the refusal
§3.31 described — that section described a door refusing, not a door removed,
and phase 1 is the removal.

**What this proves, and what it does not.** The 404 walk proves the routes are
gone from the running application. It does not prove production's `sql_mode`
refuses a `GUEST` row the way the local suite's session — pinned to strict mode
on purpose — does: the column definition itself is proven
(`information_schema.COLUMNS` no longer lists `GUEST` on `users.role`), but a
lax production server would still store an out-of-range value as `''` with a
warning rather than refusing it outright, and that has not been checked
against the live server.

**Checked open, in a browser, on 2026-09-11 — headless Edge, against a local
API and web build on the development database. Local, not production**, and
said so plainly rather than left ambiguous: the homepage's pricing cards load
from `/cms/plans`; `/book` answers 404 with nothing on the site linking to it;
forgot-password by phone shows the same neutral sentence, mails nothing to a
placeholder address, and does mail a real one; login succeeds by a
local-format phone and separately by email; Users & Roles shows a placeholder
as "not set" and an edit through that form replaces it; a mailed reset link
sets the password once and a second use of the same link is refused; signup's
step 2 will not continue without an email. Signup's own landing was wrong —
after "Create workspace & sign in" the page landed on `/login`, because it
adopted the token without telling `AuthProvider`, so `/auth/me` was never
called and `consoleGate` saw nobody signed in — fixed in this commit
(`auth.tsx` gains `adoptToken`, `login` now calls it instead of repeating its
lines, and signup calls it and routes with `landingFor`); the controller
confirms by re-running the same browser check.

The same local API also ran `smoke.ps1`, `phase6-smoke.ps1` and
`activity-smoke.ps1` end to end. `smoke.ps1`'s step 3-4 (the double-booking
guard) depends on the seed's `BK-00001` occupying Camellia — `seed.ts` cannot
be re-run to refresh that (§6.1), so this relied on the development
database's existing seed data rather than a fresh one; run twice, the guard
held both times, refusing the conflicting booking with 409 on the second run
as on the first.

This pass is proven by a browser session and three smoke runs, not by a
screenshot filed anywhere — and production's `sql_mode`, collation and
phone-collision counts are still unknown; none of this reached the live
server (§6.1). Nothing from this branch is deployed.

**Addendum (2026-09-11) — every account has both, and two things the sweep
found on the way.** The reset closed OTP's door but opened a narrower one of
its own: self-signup stored only a phone, an invited agent had only an email,
and a mailed reset link needs an address — the owner who signed up alone was
exactly the person it could never reach. The owner's ruling closes it at the
account rather than the reset: **every account now carries an email and a
phone, signs in with either, and a forgotten password resets by either.**
`every-account-has-an-email-and-a-phone.spec.ts` proves both are required on
every path that makes or edits an account (signup, a resort adding a
colleague, an agent invite, an agency hiring its own staff) and that sign-in
reaches the same account either way; `a-password-can-be-reset.spec.ts` proves
the request accepts either identifier and always mails the link to the
account's own email.

The same spec is the first thing that has ever called `signup` from a test.
It found `signup` unable to complete on any call since `bc5d9fa` (2026-09-08):
`ensureResortRoles` ran on a second database connection from inside the
signup transaction and deadlocked against the resort row that transaction had
not committed yet, failing with P2003 every time. Nothing caught it because
nothing had called it. The same spec also found phones were not stored the
way login reads them — signup normalised a typed phone through
`normalizePhone`, but the resort-colleague and agency-hire paths only
stripped non-digit characters, so a colleague added as `01712...` was stored
as `01712...` while login looked for `8801712...` and never found them. Both
are fixed and both are now pinned by that spec.

Rows that already existed with only one of the two got a placeholder from
migration `20260911130000_every_account_has_an_email_and_a_phone`
(`user-<id>@placeholder.invalid`, `placeholder-<id>`) — a gap marked as a gap,
not an address. `every-account-has-an-email-and-a-phone.spec.ts` proves a
placeholder is never mailed, never printed on an agency's quotation or export,
and never shown to another party as a way to reach someone;
`a-password-can-be-reset.spec.ts` proves an account stuck with a placeholder
email gets no reset mail, because there is nobody there to receive it;
`apps/web/test/contact.spec.ts` proves the console shows a placeholder as
"not set" rather than the fake value underneath it. An admin replaces one from
the team edit form (`updateResortUser`) — the resort's own admin may, unless
the person also works at another resort, in which case only `SUPER_ADMIN` may,
the same gate a password or role change already sits behind, because changing
the address changes who the account belongs to.

## 4. What is left

P3, P4 and the SSLCommerz half of P5 are done; §3 describes them. What follows
is what is genuinely still open, ordered by the same rule: **a platform earns
money only when it can onboard a tenant without us, enforce its own terms, and
never promise what it does not do.**

### What the audit found and is still open

§3.29 closed most of it. What genuinely remains, and why:

**Domain gaps worth building.** A housekeeping bit, so a room is not sellable
the instant a guest leaves — there is already a `HOUSEKEEPING` role that
resolves to zero permissions. Dated out-of-service blocks with a reason, which
is what would make the idle-inventory pitch true for past quarters rather than
only today. Weekend rate plans, which is the most common pricing rule in this
market and something `RatePlan` cannot express. A cancellation and refund
policy: the workflow exists, the policy does not, so every refund amount is
typed in by hand. Child pricing — `children` is stored and multiplied by
nothing. Meal plans, since every package here is sold as room plus breakfast
plus dinner. Group bookings as an entity rather than a `groupTag` string, which
currently produces seven invoices for one seven-room group.

**The legal one.** A guest roster. `adults: 3` records one name, and
foreign-guest reporting in Sajek and Bandarban needs nationality, document type
and every occupant.

**Smaller, still true.** Overlapping rate plans resolve by whichever row the
database returns first, so a resort with a season and an Eid weekend gets a
price that depends on row order. `Payment` has no `resortId`, which is the index
a cash-accountability feature will want first. Most tables have no `updatedAt`.
`NotificationJob.renderedText` keeps the body of every message ever sent,
forever, with no purge. NID and passport numbers are masked by the API and
exported unmasked to CSV. There is no offboarding path for a tenant, and the FK
graph makes deleting one structurally impossible.

**Deliberately not done.** Occupancy, ADR and RevPAR as first-class metrics —
two of the three are already computed inside `idleInventory` and thrown away, so
this is cheap, but it is a feature rather than a defect. Day close. Cash
accountability (STRATEGY D3). Per-room pricing (D4).

**Left standing by §3.30, and worth naming.** Commission is read live, so
changing the rate changes what last month's agent report says an agent earned.
That was equally true of the per-agent field it replaced — no booking has ever
stored the terms it was sold under — but the fix is now a smaller one: a
commission snapshot on the booking. Until then, change the rate at a period
boundary. Retired rooms also keep their names under `UNIQUE(resortId, name)`,
so reusing the name of a retired room means renaming that one first; the error
message says so rather than leaving the owner guessing.

### Next, and small

1. **Decompose the two large pages.** The missing primitives are the root cause
   and they now exist, but `settings/page.tsx` is still ~1,200 lines holding
   nine tab components and `bookings/page.tsx` ~800 with the modal, the drawer
   and the list in one file. Splitting them is mechanical and low-risk; it was
   left until last because file size is a symptom, and the disease was the
   missing primitives.
2. **More front-end tests.** There are 39, on the offline queue, the offline
   read cache, the agency calendar and the booking hand-off. The money formatter, the
   permission-driven navigation and the outbox bar are the next three worth
   holding down.
3. ~~**Mobile adopts the typed client.**~~ Settled the other way: the app is
   retired, not merely frozen (§3.27, §3.32). If it is ever revived, this is
   still true of it.
4. **Agency staff resort links are copied at hire time and never again.** An
   agency approved for a new resort has staff with no link of their own to it.
   The room search works around this by running on the agency's authority; the
   rest of the agent surface has not been swept for the same assumption.
5. **One-off charges are collected by hand.** `PlatformCharge` records what is
   owed and the platform marks it paid in Platform → Dues; no gateway is
   involved, the same as subscription dues. That is deliberate until a merchant
   account exists (§5), not an oversight.

### P5 — Growth, when the above is quiet

**A merchant account** turns the payment work on (§5 — owner only). **The
channel manager** is still deliberately unbuilt: see below. **The mobile
release** likewise.

### Deliberately dropped

**Chains as a segment** — built for a customer never met; keep multi-resort as a
capability, stop building for it. **OTA channel sync** and **embed themes** —
both assume a maturity the platform has not reached; the offline front desk was
worth more than either and is now the only thing in this market that does it.
**The mobile app release** — guests do not book at all now (§3.31), and the
offline work landed in the browser, so a native shell buys less than it did.
The app is formally retired as of 2026-09-11 (§3.32); its shipped build still
has its Book button, and the API now answers it with a 404 like every other
guest door removed in phase 1, rather than the refusal sentence it used to
answer with.

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
4. ~~**SSLCommerz merchant account.**~~ Moot as of 2026-09-11: guest online
   payment, the mock gateway and the SSLCommerz adapter were all removed with
   the rest of the guest surface (§3.32) — there is no online payment path
   left to turn on. Every payment is now recorded by hand at the desk
   (`payments.service.ts`: cash, bKash, Nagad, card or bank transfer logged
   against a booking), the same as the platform's own subscription and
   one-off charges (§4 item 5).
5. **SMS sender ID** — the SSL Wireless adapter is written and dormant; only
   `SMS_SENDER_ID` is missing.

## 6. Deploying this branch

**It is deployed.** §3 records what went wrong on the way and what now guards
against it. The sequence that worked, for next time:

```
pnpm -F @rh/api test            # app-boots.spec.ts is the gate
git pull --ff-only
pnpm install --frozen-lockfile
pnpm -F @rh/api db:baseline     # look first
pnpm -F @rh/api db:baseline -- --apply
cd packages/db && npx prisma migrate deploy && npx prisma generate
cd ../.. && pnpm -F @rh/web build
pm2 restart api web
```

Take a `mariadb-dump` before the migration step and check it ends with
"Dump completed". The notes below predate the first deployment and are kept for
the reasoning.


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

### 6.1 Deploying this branch (phase 1 — guests leave), not yet done

Everything above describes the audit branch's deploy on 9 Sep, already live.
**This branch has not been deployed.** Two of its migrations are destructive
in a way none above were: `20260911110000_no_guest_accounts` deletes every
`users` row with `role = 'GUEST'` and narrows the `role` enum to exclude it,
and `20260911110500_login_codes_are_gone` drops the `otp_codes` table
outright. **Back up first** — `mariadb-dump ... | gzip`, and check the gzip
before trusting it. There is no undo once those run.

A third migration, `20260911130000_every_account_has_an_email_and_a_phone`,
makes `email` and `phone` both `NOT NULL` on `users`. **It must ship with the
web forms in the same deploy** — the API already refuses the shapes the old
signup, add-colleague, invite-agent and add-agency-staff forms send (no
`email`, or no `phone`), so deploying the migration and the API ahead of the
web build would leave every one of those forms 400ing until the web deploy
catches up.

Before running it: `SHOW CREATE TABLE users` on production, to see the
column's actual collation (checked here against every database this branch
touched, not against production's). Then count how many phones collide once
normalised to the canonical form the migration computes, with the read-only
form of the same query the migration's own `UPDATE` joins against
(`migration.sql`'s `by_number` derived table, minus the write):

```sql
SELECT canon, COUNT(*) AS holders
FROM (
  SELECT
    CASE
      WHEN d LIKE '880%' AND CHAR_LENGTH(d) >= 13 THEN LEFT(d, 13)
      WHEN d LIKE '880%' THEN d
      WHEN CHAR_LENGTH(d) = 11 AND d LIKE '0%' THEN CONCAT('880', SUBSTRING(d, 2))
      WHEN CHAR_LENGTH(d) = 10 THEN CONCAT('880', d)
      ELSE d
    END AS canon
  FROM (
    SELECT REGEXP_REPLACE(phone, '[^0-9]', '') AS d
    FROM users
    WHERE phone IS NOT NULL AND TRIM(phone) <> '' AND phone NOT LIKE 'placeholder-%'
  ) AS digits
) AS every_row
GROUP BY canon
HAVING COUNT(*) > 1;
```

A group this returns is two (or more) spellings of the same number, on
different accounts — the migration leaves every row in it exactly as spelled,
rather than merging accounts or guessing which one is right. Two spellings of
the same number are left as they are, not merged, so a row like that keeps its
old shape rather than gaining the placeholder-safe one. **What that costs:**
neither twin can sign in with the canonical form of the number, and neither
can ask for a reset by phone — only by whichever spelling is actually stored,
or by email if the account has one. **The remedy is a manual one, already
open:** an admin sets one twin's phone to the canonical number from the team
edit form; `contactTaken` allows it, because neither twin holds the canonical
form yet, so nothing collides at the moment of the edit. The other twin still
needs its own fix. The baseline dry run shows neither the collation nor this
count: `baseline-db.mjs` classes this migration data-only from its DDL alone
and does not inspect what the data actually is, so both checks are manual, and
the count from a dry run here (against a database this branch's specs and
scratch tables touched) is not a production number.

`packages/db/prisma/seed.ts` cannot run on this branch — it imports
`BookingSource` as a Prisma enum, which `6caad88` (before this branch) turned
into a `resort_options` row, and the import fails before the script does
anything. Pre-existing, unrelated to phase 1's changes, and left as found.

Sequence: `git pull`, `pnpm install`, then `pnpm -F @rh/api db:baseline` and
read the dry run's list before doing anything else. Then `pm2 stop api`
*before* `db:baseline -- --apply`, so a request in flight cannot hit the old
OTP routes against a half-migrated database while the migration runs —
`db:baseline -- --apply` already ends by running `prisma migrate deploy`
itself (`baseline-db.mjs`), so there is nothing left to run there. Then
`prisma generate`, `pnpm build`, `pm2 restart api web`.

Reset links (and the agent-invite link) are built from `PUBLIC_WEB_URL`,
falling back to the production console's own address,
`https://resortmela.rootcodebd.com`, when it is unset
(`password-reset.service.ts`, `platform.service.ts`). Set it only if the
console is ever moved to a different domain — it does not need to be set for
this deploy to work.

The GUEST-deletion migration is two statements (`DELETE` then `MODIFY`), and
MySQL/MariaDB DDL is not fully transactional, so a failure partway through can
leave the `DELETE` applied and the enum `MODIFY` not. That is safe to repeat:
`npx prisma migrate resolve --rolled-back 20260911110000_no_guest_accounts`,
fix whatever the error named, and re-apply.

Verify **by opening the pages**, not by curling the API — a 200 is not proof a
screen works (the last deploy's reports fix was verified with curl, reported
done, and the page was still broken). Open the homepage and check the pricing
cards are there; open the login page and check the "Forgot password?" link
actually sends an email whose reset link works. The shipped mobile build's own
Book button will now 404 instead of showing its old refusal message —
expected, the app is retired (§3.32), not merely frozen.

## 7. Working on it

```
pnpm install
pnpm -F @rh/api test:setup     # creates resorthub_test and migrates it
pnpm -F @rh/api test           # 729 tests against a real MySQL
pnpm -F @rh/web test           # 117 tests, jsdom
pnpm typecheck                 # four packages; mobile is frozen (§3.27)
pnpm dev                       # api :4000, web :3000
```

The integration suites run against a real MySQL on purpose. The guarantees they
cover — the `booking_nights` guard, recomputed money, per-resort counters — only
exist at the database level, so testing them against a fake proves nothing.
`resetDb` refuses any database whose name does not end in `_test`.

**A note on the tests:** they are the safety net for everything above, and they
have teeth. Reintroducing the nights-multiplier bug fails 14 tests across 3
files. If a change here does not break something, be suspicious of the change.
