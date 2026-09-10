# Two customers, one platform — design

*2026-09-11. Decided in conversation with the owner; every decision below was
his, and the reasoning is recorded so a later reader can tell a choice from an
accident.*

---

## 1. The sentence this is all built on

> **Resort Mela sells to resorts and to travel agencies. Nobody else has an
> account.**

A guest is somebody a resort writes into its register. Not a user, not a login,
not a visitor with a panel. Everything below follows from that.

This closes a question that has been half-open for weeks. Guest booking was
already refused at the door — `bookings.create` throws for `ROLE.GUEST`, and
`/v1/bookings` answers a polite 400 — but the doors, the rooms behind them and
the corridors joining them all still exist. The owner's words: *"guest kono
booking directly korte parbe na. availability o dekhte parbe na. guest er kono
login e thakbe na. guest er kono panel e thakbe na."*

---

## 2. Decisions

| Question | Decision |
|---|---|
| Guest login, guest panel, guest availability | **Gone.** Not gated — removed |
| `/v1` public API (a resort's own website) | **Closed.** `/cms` survives, separately |
| Guest online payment (`payments/intents`) | **Closed** |
| Who the platform bills | **Resorts and agencies only** |
| Where agency billing lives | **One machine, two shelves** — same tables, `audience` on the plan |
| How an agency joins | Self-signup, then the platform owner verifies, then a subscription with a trial |
| How a resort admits agencies | **Open by policy, block by exception** — no per-agent approval |
| Commission | One rate per resort, with a per-agency override where a deal was struck |
| An agency that stops paying | **Cannot sell. Its existing bookings are untouched** |
| When a resort chooses | **At signup**, asked properly, not buried in Settings |
| Order of work | **Guests leave first** |

### 2.1 Why one billing machine rather than two

The alternative — `agency_plans`, `agency_subscriptions`, an agency billing
sweep — was considered and rejected. The numbers decided it. The machinery is
`billing.service.ts` (464 lines), `subscription.service.ts` (363),
`plan-limits.service.ts` (215) and `tenant-state.service.ts` (41). Separate
tables mean a second copy of most of that.

`resortId` appears 32 times across 27 lines of the billing sweep. Every one of
them falls into four groups, and they were read one by one rather than counted:

| Group | Lines | What it is |
|---|---|---|
| Who is told, and by what name | 140, 263, 300, 328, 355, 410, 430–455 | the notify path and `billingContacts` |
| Which entity the audit row is about | 235, 255, 272, 362, 365, 413, 416 | bookkeeping of the event |
| Suspend, and resume when settled | 349–352, 387, 399–407 | the consequence |
| Signatures carrying it through | 210, 245, and the log line at 369 | plumbing |

**Not one of them is an arithmetic rule.** "A trial that ends becomes active",
"a renewal raises a due", "a due past its grace is overdue" — none of that knows
or cares whether the customer rents rooms or sells them. The one that looks like
business logic, line 387, asks "does this customer still owe anything" — a
question about an account, currently asked about a resort.

A second copy of a money rule is how the first one stops being true. This
codebase has already paid that bill: every report reimplemented `bookingTotals`
and so disagreed with the invoice for any resort charging tax, and a refunded
stay still counted as collected.

The one honest argument for separate tables was that renaming
`Subscription.resortId` touches a paying customer's live row. **There is no
paying customer.** The owner confirmed it on 2026-09-11: the production rows are
demo data. The argument evaporated.

The second consideration — that agency revenue might later change shape — was
also raised and answered. It changes shape by *addition*: a subscription fee
**plus** a share of the commission the agency earns. That is another charge
against the same account, and `platform_charges` already exists to hold charges
that are not subscription dues (it holds email-credit purchases today).

### 2.2 What genuinely differs between the two customers

Sharing the machine does not mean sharing the meaning.

| | Same | Different |
|---|---|---|
| When a bill is raised, grace, overdue | yes | |
| Who is told, and by what name | | yes — a few lines |
| What suspension *does* | | yes — **materially** |
| Which plans, features, limits, prices | | yes — **entirely** |

Suspension is the sharp one and cannot be shared:

- **A resort behind on its bill** stops being able to save new entries — but
  guests are asleep in its rooms tonight, so check-out must still work. This is
  `tenant-state.assertWritable`, and it exists.
- **An agency behind on its bill** stops being able to sell. The bookings it has
  already made stay live, stay visible to it, and stay honoured — the guest did
  nothing wrong, and the resort is expecting them.

---

## 3. What this is not

Scope guard. None of the following is touched:

- **The `guests` table.** It is the resort's own register — name, phone, NID,
  history. The front desk fills it in exactly as it does today. Removing the
  guest *login* does not remove the guest *record*, and confusing the two would
  delete a customer's book.
- Bookings, payments, reports, restaurant, expenses, payroll, rooms, rates.
- `/cms` — the platform's own marketing content.
- Anything in the permission matrix beyond the agent rows described in phase 5.

---

## 4. Phase 1 — guests leave

Deletion, so it is the cleanest phase and it shrinks the surface every later
phase has to work against. That is why it goes first.

### 4.1 Removed

| What | Where |
|---|---|
| Guest API — 10 endpoints | `apps/api/src/guest/` (controller, service, module) |
| Phone-OTP login and the GUEST user it mints | `auth.controller` `otp/request`, `otp/verify`; `auth.service` around L149 and L158 |
| `ROLE.GUEST` | `packages/shared`, and the guards that name it |
| Guest web pages | `apps/web/src/app/(public)/book`, `book/trips`, `book/[id]` |
| Guest client functions | `apps/web/src/lib/api.ts` — the `guest*` block |
| Homepage links | "Book a stay" (header, nav), "Guest booking" and "My trips" (footer), and the `#api` section |
| The `/v1` public API | `PublicApiController` in `platform/public-api.controller.ts` |
| API-key claims | `common/rbac.ts` `apiKeyClaims` |
| Guest online payment | `payments/intents.controller.ts`, `intents.service.ts`, and the gateway webhook |
| `OtpCode` | schema — nothing mints one once OTP login is gone |
| The frozen guest app | `apps/mobile` — formally retired, not left ambiguous |
| Rate-limit routes for removed surfaces | `app.module.ts` L73 — `"guest"`, `"v1"`, `"payments/webhook"` |

### 4.2 The trap that must not be sprung

**`/v1` and `/cms` live in the same file.** `public-api.controller.ts` declares
`PublicApiController` (`@Controller("v1")`, authenticated by `X-Api-Key`, for a
resort's own website) and `PublicCmsController` (`@Controller("cms")`, no auth,
the platform's own homepage).

`/cms/plans` is where `resortmela.app` gets its pricing cards — the same rows
Platform → Plans edits. **Deleting the file to remove `/v1` would empty the
platform's own pricing section and stop anybody signing up.**

So: `PublicCmsController` moves to its own file, renamed for what it actually is
— `marketing.controller.ts` — before `PublicApiController` is removed. Two
things with `public` in the name doing unrelated jobs is how this trap was set in
the first place.

### 4.3 Space left for a resort-website integration

The owner asked for room to revisit this: *"pore amra jodi thik kori resort er
website theke data tanbo, tokhon chinta korbo. shetar jonno space rekhe dio."*
That sentence reads two ways and both are recorded here, because the note is the
space:

- **Their site reads from us** — the old `/v1`, restored. If it returns it must
  be **read-only**: availability and rates, never a booking. "A guest cannot book
  directly" is permanent, and a booking form on a resort's own website is a guest
  booking directly however it reaches us.
- **We read from their site** — an import or a scrape. Nothing in the current
  code points this way; it would be a new component, most naturally sitting
  beside `import/`.

Space is left as **a table, a note and a findable commit — never as dead code.**
`api_keys` keeps its rows; no code touches it. The Settings → API keys tab is
**hidden, not deleted**, because a screen that mints a key opening nothing is a
lie told to a customer. The removal commit is named so one `git log --grep`
finds it.

This codebase has been bitten by the other kind of space: `POST
/bookings/:id/email-invoice` is declared twice and module order decides which
wins — the loser carries a one-night billing bug that a reordering would
activate; `sweepPaymentDeadlines` is duplicated with no caller at all. Code kept
"in case" does not hold a place open. It sets a trap.

### 4.4 Consequences to follow through

- `public_api` leaves `PLAN_FEATURES` **and** every plan row that lists it.
  `isPlanFeature` rejects unknown keys, so an orphan would fail validation on the
  next plan edit.
- `bookings.service` can drop its `ROLE.GUEST` refusal once the role is gone —
  but only then, and the spec that proves guests cannot book must keep proving it
  through whatever door remains.

---

## 5. Phase 2 — the subscriber is an account, not a resort

### 5.1 The change

`Subscription.resortId` is the weld. A subscription belongs to a **customer**,
and a customer is a company: one that owns resorts, or one that sells them.

`Tenant` is already that company — name, slug, status — and already owns
resorts. It gains a `kind`:

```
tenants            + kind        RESORT_OWNER | AGENCY
subscriptions      resortId   →  accountId
subscription_dues  resortId   →  accountId
platform_plans     + audience   RESORT | AGENCY
```

`Tenant.plan` is **dropped**. It is a shadow entitlement: a second answer to
"what may this customer do", which diverges from the subscription the first time
a plan changes. `PlanLimits` already treats it as a fallback below the real
subscription.

### 5.2 Why this is smaller than it looks

`PlanLimits` is **already account-shaped**:

```ts
async forResort(resortId) {
  const resort = await ...select: { tenantId: true }
  return this.forTenant(resort.tenantId);           // the real work
}
async forTenant(tenantId) {
  ...subscription.findFirst({ where: { resort: { tenantId } } })   // resort is only a bridge
}
```

Entitlement has been a property of the tenant all along. The resort in that
`where` clause is a join, not a meaning. Phase 2 removes the bridge.

### 5.3 What has to be preserved

- **One live subscription per account.** Enforced today by a generated column,
  `liveKey` — the resort id while the status is live, NULL once cancelled, under
  a unique index — deliberately not in the Prisma model, because a column the
  application can write is a column the application can get wrong. It becomes
  account-keyed and stays out of the model.
- **The idempotent sweep.** `@@unique([subscriptionId, periodStart])` is why a
  second run on the same period cannot raise a second bill.
- `billing.service`'s 27 `resortId` lines collapse into one small resolver —
  given an account, who is told and what are they called — plus the two
  consequence paths (suspend, resume) which are per-kind by section 2.2 anyway.

---

## 6. Phase 3 — the agency is a customer

### 6.1 The shelf splits

`PlatformPlan.audience` divides one price list into two. A resort never sees an
agency plan; an agency never sees STARTER. `PLAN_FEATURES` gains an audience the
same way — "Restaurant POS & room tabs" is not a thing an agency can buy, and
sub-agent seats are not a thing a resort can.

The numeric limits already on the plan (`maxRooms`, `maxResorts`, `maxStaff`,
`trialDays`) stay where they are. The plan editor shows only those that mean
something for the audience being edited; `maxStaff` carries sub-agent seats on an
agency plan. No new columns, no migration risk, and the guardrails in
`PLAN_BOUNDS` keep working.

### 6.2 How an agency arrives

Mirrors resort signup exactly, because the owner asked for exactly that — *"agent
er jonno o sign up system thakbe, subscription system thakbe, thik jemon resort
er ase. ekdom dynamic."*

1. Agency signs up: `Tenant(kind: AGENCY, status: pending)` plus
   `User(role: AGENT)` plus a subscription on the chosen plan, in trial.
2. It appears in the platform owner's panel as a row to verify. **This is now the
   only gate**, so it is the one that has to be real.
3. Verified, it can sell every open resort. **Once, not once per resort.**

Today there is no front door at all: an agency exists only because a resort
invited it, or because a guest asked for access and was promoted. That is
precisely the friction being removed, so the door has to be built for the rest of
the design to stand up.

### 6.3 Suspension, agency-side

New, and not shareable with the resort version (section 2.2). An agency past its
grace period cannot create bookings. It keeps its login, its history, its
commission figures and its existing bookings, all of which stay honoured.

---

## 7. Phase 4 — offers

The owner's idea, generalised. *"platform theke invitation pathanor time e plan
select kore dibe... ami kauke amar platform e anar jonno amar banano ekta free
trial offer korlam."*

```
Offer {
  code / link
  audience      RESORT | AGENCY
  plan          which plan the signup lands on
  trialDays     overriding the plan's own
  discount?     optional
  expiresAt
  maxUses, uses
  createdBy
}
```

One object, three jobs: a private invitation (one use), a campaign (a hundred
uses, "60 days free"), and today's `invite-agent` — which mails a password and
should not exist — folded in and deleted.

It also answers a question nothing currently answers: **which channel brought
this customer.** Uses are counted per offer.

---

## 8. Phase 5 — the open door

### 8.1 The problem being solved

Today an agency requests access to each resort and a manager clicks Approve. Ten
agencies and fifty resorts is five hundred clicks — and the manager cannot
actually vet a travel agency they have never heard of by reading its name. The
approval is a **ceremony of safety, not safety**.

The resort's real decisions are commercial, not about identity: what commission,
and do I show my rates. Both are already resort-level and set once
(`agentCommissionRate`, `showRatesToAgents`). Identity is the platform's job, and
the platform is where it can be done.

### 8.2 The model

```
selling access = agency verified and paid up
               AND resort open to agents
               AND this agency not blocked by this resort
```

- `Resort.agentsOpen` — one switch, asked at onboarding.
- A blocklist — `{ resortId, agencyId }`, the exception, not the rule.
- Per-agency commission override where a deal was struck; otherwise the resort's
  rate.

### 8.3 Two things this fixes on its own

**The team list stops showing agents.** Approving an agency today writes a
`user_resorts` row, because that is the only place the login token reads access
from. So `user_resorts` means two incompatible things at once: the team screen
reads it as "works here", the token reads it as "may enter here". An agent is
forced into the staff table and shows up in the team list. Filtering `AGENT` out
of that query would be the third role exclusion added to a list that should never
have needed one — `SUPER_ADMIN` was the second. Once selling access lives in its
own place, the team list is staff **by construction**.

**An agent's access stops being frozen into a token.** `claims.resortIds` is
minted at login and lives seven days, so revoking access today does not revoke it
until the token expires. Selling access becomes a lookup at the point of use.

### 8.4 Onboarding asks properly

*"resort kholar shomoy system ask korbe, shundor ui er maddhome. respectfully."*

A step in resort signup that explains what an agency is, what commission means,
shows how many verified agencies are live right now, and asks. Not a checkbox in
a settings tab; a question, asked once, with the number that makes it a real
choice.

---

## 9. A business caution, recorded

The platform will earn a subscription from the agency **and** a commission from
the resort on the same booking, and possibly a share of the agency's commission
later. OTAs charge both sides; this is normal. It holds on one condition:

> **The agency's plan must sell tools, not admission.**

Selling should be free once verified. Charge for sub-agent seats, the agency's
own client list, bulk email, rate visibility, its own API. An agency that pays
before it has earned anything churns before it has earned anything. The free
trial is the same instinct, and it is the right one.

---

## 10. How each phase is proved

TDD throughout: red first, and a test that passes before the fix is a test to go
and read.

| Phase | Gate |
|---|---|
| 1 | A spec that walks every removed door and finds it gone — not refused, **gone** (404, route absent). Plus: `/cms/plans` still answers and the homepage still renders its pricing cards |
| 2 | An account with no resort can hold a subscription, be billed, fall overdue and be suspended. Existing resort billing specs must still pass **unchanged** — if they need editing, the meaning moved and that is a finding |
| 3 | A resort never sees an agency plan and an agency never sees a resort plan. A suspended agency cannot create a booking; the bookings it already made still read and still check in |
| 4 | Signing up through an offer lands on that plan with that trial. An expired offer, and an offer past `maxUses`, both refuse |
| 5 | Selling access is computed, not stored: closing a resort or blocking an agency takes effect on the **next request**, not the next login. The team list contains staff and nothing else, with no role exclusions in the query |
| all | `pnpm -F @rh/api test` (`app-boots.spec.ts` is the gate that proves Nest can still wire itself), `pnpm -F @rh/web test`, `pnpm typecheck` |

A note on the phase-2 gate: the API's `tsconfig.build.json` does not cover
`test/`, so `tsc` will not catch a spec that constructs a service by hand and has
gone stale. Only vitest will. This has bitten twice.

---

## 11. Order, and where to stop

1. **Guests leave** — deletion, independent, shrinks everything downstream
2. **The account** — the foundation the rest stands on
3. **The agency is a customer** — signup, shelf, verification, suspension
4. **Offers** — invitations and campaigns
5. **The open door** — access, blocklist, onboarding, and the team list

Each phase is its own branch and its own deploy. **The owner can stop after any
of them** and what shipped is coherent on its own.
