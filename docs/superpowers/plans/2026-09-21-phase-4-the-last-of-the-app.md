# Phase 4 — the last of the app

**Spec:** [the native mobile app](../specs/2026-09-13-native-mobile-app-design.md),
§0.7 and §10. Phase 4 is three screens, push, polish, and the deletion of the
WebView.

Phases 0–3 are done. `NOT_YET` in `every-door-opens.spec.ts` is empty and no
screen renders `NotBuiltYet`: every destination `CONSOLE_NAV` offers has a real
screen behind it on both clients. What is left is the work that was deliberately
kept until last, because each piece of it touches something the earlier phases
were not allowed to touch — the front door, the printer, the schema, and the
scaffolding.

## What "complete" means here

The spec's own rule, unchanged since it was written:

> A phase is not complete because its tests pass. It is complete when the APK
> has been installed on a real phone.

0.5.0 is building as this plan is written, and closes phase 3. Phase 4 ends the
same way, and the WebView cannot be deleted until that build has been used.

## Global constraints

These are phase 2's, still in force, plus two of this phase's own.

1. **`@rh/shared` is the source of truth.** Each task's first commit adds
   exactly the routes that task's screens call, typed against the controllers,
   and ports the console's hand-written call sites in the same commit.
2. **No path literal in a screen.** The escape hatch is `client.ts`.
3. **Every screen file implements loading, empty and error.**
4. **TDD, red first.**
5. **Nothing is deleted that this plan does not name.**
6. **The emulator is never started on this machine.** Expo Go over
   `adb reverse` on the owner's phone is the device loop.
7. **New for this phase — the schema change runs against production only with
   a verified backup and the owner's word on the day.** `DeviceToken` is the
   only schema change the whole project makes. A dump that exists is not a dump
   that restores; the drill is in `verify-a-backup-by-restoring-it`.
8. **New for this phase — the WebView is deleted last, and only after the APK
   built from this phase has been run on a real phone.** It is the fallback
   that has made every phase safe to ship; removing it before the replacement
   is proven is removing the net first.

## The tasks

| task | state |
|---|---|
| 1 — signup, both kinds | **done** — the rule in `@rh/shared`, two screens, and the doors on the login screen |
| 2 — the invoice, and giving it to a guest | **done** — typed off the service, rendered, shared as a PDF |
| 3 — `DeviceToken`, and the token's life | **done** — the table, the two routes, registered on sign-in and forgotten on sign-out |
| 4 — what is worth waking somebody for | **done** — four events, audience from the permission matrix |
| 5 — the twenty-three untyped routes | **one down, twenty-two left** — the invoice was typed because task 2 needed it; the rest is debt, carried |
| 6 — the polish list the sweeps found | **done** — all six |
| 7 — delete the WebView | **done** — and two guards fired to say so |
| 8 — the suite, the APK, the phone | in progress |
| 9 — the bar, on every screen that has one | **done** — 23 routes checked on a phone |
| 10 — a price list, and a plan that survives to signup | **done** — not in the plan, and should have been |
| 11 — a welcome, because the first screen was a form | **done** — same |

### Three things this plan did not contain

All three were found by the owner opening the app, not by me reading
it, and all three were the same kind of miss: I wrote the plan from
the spec's list of screens and never asked what a person meets when
they open the thing.

**The bar.** `bookings/[id]` and the two task flows lived outside the
tab navigator, so it vanished on the booking detail, the payment form
and all three steps of taking a booking. There was a documented reason
for the task flows — a bar invites somebody to wander off mid-payment —
and the owner overruled it twice, which settles it. Twenty-three routes
now carry it.

**The price list.** The phone sent no plan, so everybody who signed up
on it landed on the entry plan whatever they had read — and they had
read nothing, because the phone had no prices. The web has had all of
this since it launched. Asked why the plan did not cover it, the honest
answer is that I read the spec's screen list, which says "signup ×2",
and did not open the web.

**The welcome.** Opening signed out went straight to a sign-in form,
and task 1 made it worse by hanging three more buttons off the bottom.
A form is for somebody who has decided.

### What task 5 actually got

One of twenty-three. `invoice` was typed because task 2 could not be
written without it, and typing it was the ordinary experience: the
payload carries `rent` *and* `roomRent`, and a screen written from the
console's JSX would have missed both halves of the frozen/live split.

The other twenty-two are routes the console calls and no phone screen
does — the cancel pair, expenses create, payroll pay, six reports, the
audit log, addUser. They are debt and they are named here rather than
quietly dropped from the plan.

### What the deletion cost, and what caught it

`App.tsx`, `src/console/`, `index.ts` and `test/url-policy.spec.ts` are
gone. Two guards failed on the next run and both were right:

- `one-source-for-a-colour` → "exempts only things that still exist"
- `a-screen-never-writes-an-address` → the same exemption, by another name

Both were written to fail exactly then. The exemption lists are empty now
and the cases stay, for the next thing that earns one.

---

### Task 1 — signup, both kinds

Two screens. `POST auth/signup` and `POST auth/signup/agency` have existed
since the console had them; the phone has no route to either, so somebody who
installs the app and has no account can do exactly nothing with it. The login
screen's "Forgot password?" is the only door off it.

- `app/signup/index.tsx` — a resort, and `app/signup/agency.tsx` — an agency.
- The login screen gains the way in. Its subtitle stopped saying "your resort
  console" on 2026-09-21 for this reason: both kinds of person meet this screen.
- The shared rule for what a signup needs goes in `@rh/shared` beside
  `whatTheBookingNeeds`, because the console asks the same question and
  currently answers it in its own page.
- Both routes are typed against `auth.controller.ts` in the same commit, and
  the console's call sites move onto them.

**Red first:** a spec that the login screen offers both doors; a spec per screen
for the gaps its form refuses to submit with.

### Task 2 — the invoice, and giving it to a guest

`client.bookings.invoice(id)` returns `unknown` — one of twenty-three. The
console renders the document at `apps/web/src/app/invoice/[id]/page.tsx`; the
phone cannot show a guest their bill at all.

- Type the invoice payload against `bookings.controller.ts` first. The screen
  is written from the service's shape, not from the console's JSX — the
  `AgencySite` lesson from phase 3, where a type written from the screen was
  missing two fields the server sends.
- `app/bookings/[id]/invoice.tsx`, reached from the booking detail.
- Share is `expo-sharing` over a PDF made with `expo-print`. The alternative —
  emailing from the API — already exists as `emailInvoice`, and this is the
  other half: a guest at the counter with a phone, not an address.
- Money is `formatMoney` and nothing else. Hermes has no currency data; the
  symbol path is the one `hermes-has-no-currency-data` records.

**Red first:** a spec that the screen draws every line the service sends, and
one that the total it prints is the service's, not a sum the screen did.

### Task 3 — `DeviceToken`, and the token's life

The only schema change in the project.

```
DeviceToken  userId · token · platform · lastSeenAt   unique(token)
```

Adds a table, alters no column. Hand-written SQL and `migrate deploy` —
`prisma migrate dev` is blocked here and the reason is recorded.

- Registered on login, deleted on logout. A device that changes hands must not
  keep receiving a resort's bookings, and that is the whole reason the delete
  is not optional.
- `lastSeenAt` so a token nobody has used in months can be swept later.
- The API gains register and unregister; both are typed in `client.ts`.

**Red first:** an integration spec that signing out drops the row, and that a
token registered twice does not duplicate.

### Task 4 — what is worth waking somebody for

Four events, from the spec: a new booking, a payment received, a check-in due,
an agent's access request.

- Expo push, FCM underneath.
- Nothing is sent to a token whose user has lost the permission behind the
  event. The permission matrix already answers this and the sender asks it.
- A resort's staff are not notified of another resort's booking. Obvious, and
  worth a spec, because `resortIds` on the claims is what makes it true and a
  sender that forgets it leaks one resort's trade to another's phone.

**Red first:** a spec per event for who is and is not sent to.

### Task 5 — the twenty-three untyped routes

`http<unknown>` twenty-three times in `client.ts`: the invoice, both cancel
routes, expenses create, payroll pay, six reports, the audit log, addUser and
the rest. Every one is a screen reading a shape nobody checked.

§0.3 says each phase types the routes its screens call, and phases 1–3 did.
These are what is left over — routes the console calls and no phone screen
does. Phase 3 found two defects by typing alone; this is the same exercise on
the remainder.

**Red first:** `the-desk-is-typed.spec.ts` gains a case per route, written from
the controller.

### Task 6 — the polish list the sweeps found

Seen on a real phone on 2026-09-21 and deliberately left:

- the guests list shows a bare **1** and a date on the right, with nothing
  saying what either is
- the calendar has no legend: pink, dark red, grey-blue and green are
  unexplained
- the agent's month calendar marks no today
- a housekeeping row's meta truncates: "Needs cleaning · Demo Resort Owner · …"
- the console's mailbox page: `h1` says "Bulk Email", the tab title says
  "Bulk email"
- `agency-guests.service.ts:203` hand-writes the sellability rule that
  `roomOffer` owns

**Red first:** the last one is a guard — no second opinion about whether a room
can be sold — and it belongs beside the rules that already exist.

### Task 7 — delete the WebView

`src/console/ConsoleScreen.tsx` and `src/console/url-policy.ts`, and the
comment in `src/api/config.ts` that points at the policy.

**Only after task 8's APK has been run on a real phone.** It is the fallback
that has made every phase safe to ship.

### Task 8 — the suite, the APK, the phone

Full suite, typecheck at the root, the APK, and the phone. Then task 7.

## What this phase does not do

- **A guest build.** Refused since 2026-09-11 and still refused: a guest is a
  row in a register, not an account.
- **Offline booking creation.** Refused in §7 for a reason that has not
  changed: the schema makes double-selling impossible, so a queued booking can
  fail on sync after staff have told a guest yes.
