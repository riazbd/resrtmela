# Housekeeping — design

## What is there today

Nothing, and worse than nothing.

`HOUSEKEEPING` is a role in the database enum, accepted by the platform's
"add a user" route, and offered in the console's team form. `permissionsFor`
answers it with an **empty array**:

```ts
if (claims.role === ROLE.HOUSEKEEPING) return [];
```

So an owner can add a housekeeper today, hand them a password, and that
person signs in to an app with nothing in it. There is no table, no route,
no console page and no phone screen. §5 lists housekeeping as a screen and
has since phase 0; three phases have passed it over because it is not a
port — there is nothing to port from.

## What the work actually is

A guest leaves. The room is dirty. Somebody cleans it. Until they do, the
front desk must not put the next guest in it, and at a twelve-room resort in
Cox's Bazar that coordination happens by shouting down a corridor.

Three facts, and they are all anybody needs:

1. **Which rooms are dirty**, in the order they matter.
2. **That a room is being cleaned**, so two people do not start on it.
3. **That a room is ready**, so the desk can sell it.

## The states

`DIRTY → CLEANING → CLEAN`, and nothing else.

A fourth state — INSPECTED, the supervisor's tick — is what larger hotels
run, and it is the first thing this design was tempted by. It is left out on
purpose: at this size the person cleaning and the person checking are the
same person, and a state nobody sets is a state that makes the other three
harder to read. It can be added when a resort asks for it; it cannot easily
be taken away once every room carries one.

**The state lives on the room, not in a log.** The question a desk asks is
"is this room ready *now*", and that is one value. Who last changed it and
when are kept beside it, because an owner does ask; the whole history is
already in the audit trail and does not need a second home.

## What moves a room without anybody touching it

**Check-out makes the room dirty.** This is the one automatic rule, and it
is the one that makes the feature work at all: without it somebody has to
mark every departure by hand, and on a busy morning they will not, and the
list will be wrong by ten o'clock — at which point nobody trusts it again.

Nothing else is automatic. Cleaning and finishing are done by a person, and
the app should not guess at either.

## What it does *not* do

**Check-in is not blocked by a dirty room.** It is warned about, loudly, and
then allowed. A guest is standing at the counter; a clerk who cannot check
them in because a checkbox has not been ticked will work around the app, and
an app people work around stops being true. The warning is the honest
version of the same rule.

**No assignment, no schedule, no task list.** Who cleans which room is
settled by the people in the building, and a twelve-room resort does not
need a rota in software. Adding one would be a second, worse copy of a
conversation that already works.

## Permissions

Two new keys, `housekeeping.view` and `housekeeping.manage`.

| role | view | manage |
|---|---|---|
| Resort admin / manager | yes | yes |
| Front desk | yes | no |
| **Housekeeping** | yes | yes |

Front desk sees the state because they sell the room; they do not set it,
because they are not the ones who know.

**`HOUSEKEEPING` stops being an empty role.** That is the bug this design
fixes first, and it is a bug that ships today.

## The screens

**The phone is the primary one here**, which is true of no other screen in
this app. A housekeeper is not at a desk — they are on the second floor
holding a mop. One list, ordered so the room that matters most is at the
top, and one tap to change a state.

The order is the design:

1. Rooms whose guest **left today** and are still dirty — somebody is
   arriving into them.
2. Everything else dirty.
3. Being cleaned.
4. Clean.

The console gets the same list, because a manager reads it from the office
and because the day sheet already shows rooms and should say which are
ready.

## What goes in `@rh/shared`

The rules both clients obey:

- `HOUSEKEEPING_STATES`, `housekeepingLabel`
- `nextHousekeepingState(state)` — the button says the state it moves *to*,
  which is the inversion `room-status.ts` already records getting backwards
- `housekeepingOrder(rooms)` — the ordering above, written once

## Tasks

| task | state |
|---|---|
| 1 — the rules, in `@rh/shared` | not started |
| 2 — the column, the permissions, the routes | not started |
| 3 — check-out makes the room dirty | not started |
| 4 — the phone screen | not started |
| 5 — the console page, and the day sheet's "ready" mark | not started |
| 6 — on the owner's phone | not started |
