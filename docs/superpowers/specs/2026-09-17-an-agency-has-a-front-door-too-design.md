# An agency has a front door too — design

2026-09-17. Asked for by the owner: agencies get a website and an API, as resorts
do, sold as plan features the platform admin switches on per agency plan.

## 1. What an agency sells, and so what its site shows

A resort's site is its rooms. An agency does not own rooms: it sells **the
resorts it is approved for**, at the resort's price, and its own **tour
packages**. So an agency's front door is:

- the agency — name, headline, intro, cover picture, contact (phone, WhatsApp,
  email, address), social links, a theme colour;
- the resorts it sells (`sellableFor`), each drawn from that resort's own
  published data: location, room types, photos, price from — the price only
  where the resort shares rates with agents (`showRatesToAgents`), because an
  agency must not publish a price the resort keeps from it;
- its active tour packages, with a price per package;
- "what is free" for a resort and two dates, limited by that resort's window
  for agencies (`agentBookingWindowDays`);
- no booking button. Guests do not book on the platform (phase 1, "guests
  leave"); the page ends in a call to the agency — WhatsApp with the stay
  written into the message.

The agency may hide a resort it sells from its page (`hiddenResortIds`).

Address: `/a/<account slug>` on the console host. The agency's own domain is
§5, after the rest works.

## 2. The plan

Two features on the **AGENCY** shelf of `PLAN_FEATURES`:

| key | label |
|---|---|
| `agency_website` | Your agency's own website |
| `agency_api` | API for your agency's site |

Separate keys from the resort's `website` / `public_api`: a feature belongs to
one shelf. The platform admin ticks them on agency plans in Platform → Plans,
which already draws each shelf from `PLAN_FEATURES` — no screen change there.

The gate is the same rule as a resort's (`effective()`): only a real
subscription takes a feature away. `PlanLimitsService` gains
`featuresForAccount` / `requireAccountFeature`. `GET /auth/permissions`
returns the agency's features for an agent, so the console hides and marks
the two screens the way it does a resort's.

Publishing needs `agency_website`; unpublishing never does. The public page
answers 404 without the feature. Minting a key needs `agency_api`; a key
already minted stops working if the feature is taken away (checked on every
call, not only at minting).

## 3. The agency's API

An `api_keys` row belongs to a resort **or** an account (`resortId` and
`accountId`, exactly one set). A resort key reaches `/v1/*` as today and is
refused at `/v1/agency/*`; an agency key the other way round.

```
GET  /v1/agency                          the agency, the resorts it sells, its tours
GET  /v1/agency/resorts/:slug/vacancy    counts and prices, window-limited
POST /v1/agency/bookings                 Idempotency-Key required
GET  /v1/agency/bookings/:code
POST /v1/agency/bookings/:code/cancel    asks the resort to cancel (an agent cannot cancel)
```

A booking goes through `BookingsService.create` **as the agency owner** — an
agent booking in every respect: PENDING, the agency's commission, selling
access, the resort's window. One booking engine; this is a caller of it. The
idempotency key is stored namespaced by account so it cannot collide with the
resort's own site keys at the same resort.

Scopes, hashing, show-once and revoke are the resort key's, unchanged.

## 4. Storage

- `agency_sites` — one row per account, created on first open.
- `uploads.resortId` becomes nullable, `uploads.accountId` added; exactly one
  set. An agency's pictures count against its own quota, stored under
  `a<accountId>/`.
- `api_keys.resortId` nullable, `api_keys.accountId` added.

## 5. Its own domain

`resort_domains` gains `accountId` (resortId nullable), the lookup answers
`{ kind, slug }`, and the middleware rewrites to `/a/<slug>` for an agency.
Verification and provisioning are the resort's, unchanged.

## 6. Permissions

Two agency permissions: `agent.website.manage`, `agent.apikeys.manage`. The
owner holds every agency permission already.
