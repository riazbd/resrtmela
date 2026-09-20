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
| 1 — signup, both kinds | not started |
| 2 — the invoice, and giving it to a guest | not started |
| 3 — `DeviceToken`, and the token's life | not started |
| 4 — what is worth waking somebody for | not started |
| 5 — the twenty-three untyped routes | not started |
| 6 — the polish list the sweeps found | not started |
| 7 — delete the WebView | not started |
| 8 — the suite, the APK, the phone | not started |

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
