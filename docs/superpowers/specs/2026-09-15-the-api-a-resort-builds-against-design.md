# The API a resort builds against — design

*2026-09-15. Phase 3 of [a resort's own front door](2026-09-14-a-resorts-own-front-door-design.md).
Phases 1 and 2 built the site and moved it to the resort's own domain. This is
for the resort that already has a website and wants it to sell.*

---

## 1. The sentence this is built on

> **There is one booking engine, and `/v1` is a caller of it — never a second
> one.**

A resort's website posting a booking must go through the same service the front
desk does, hit the same `UNIQUE` constraint, write the same rows and compute the
same money. The moment there are two ways into `bookings`, there are two rooms
called 102 on the same night.

Everything in §5 follows from that sentence, and it is the one thing in this
document that is not negotiable for convenience.

---

## 2. Decisions

| Question | Decision |
|---|---|
| What a key is | A secret shown once, stored as a hash, belonging to one resort |
| What a key may do | **Scopes** — `read`, or `read` and `write`. A site that only shows availability holds a key that cannot book |
| What unlocks it | The `public_api` plan feature, with its gate, shipped together |
| What `/v1` reads | The published view — the same module the website renders |
| What `/v1` writes | Bookings, **through `BookingsService`** |
| Repeat requests | An `Idempotency-Key` is **required** on every write |
| Who made a booking | The booking records the key |
| How their site hears about changes | Webhooks, signed, retried, visible in the panel |
| Versioning | `/v1` in the path. A breaking change is `/v2`, and both run |

### 2.1 Why scopes rather than one kind of key

Most integrations only read: a site that shows rooms and rates, and sends the
guest to a phone number. Handing that site a key that can create bookings means
the blast radius of their WordPress plugin being compromised is our booking
table. Two scopes cost one column and remove the whole class.

### 2.2 Why an idempotency key is required rather than optional

A booking request that times out is not a booking request that failed. The
client cannot tell the difference and will retry, and without a key we make two
bookings and the guest is charged twice for one room.

Optional is worse than absent: it means the careful integrator is safe and the
hurried one silently is not, and we find out from the resort. Required means
every caller is made to think about it once, at the beginning, when it is a
line of code rather than an apology.

---

## 3. The keys

`api_keys` exists and holds what a key needs — a prefix, a hash, an active flag,
a last-used stamp. It gains one column:

```
api_keys
  + scopes  JSON   -- ["read"] or ["read","write"]
```

- The secret is `rm_live_<prefix>_<random>`, **shown once** at creation and
  never again. What is stored is its hash.
- The prefix is in the secret so a leaked key can be identified from a log
  without holding the key itself.
- `lastUsedAt` is written at most once a minute per key — a timestamp is not
  worth a write on every request.
- Revoking is immediate: the guard reads the row, and the row says `active`.

### 3.1 Minting one

`createApiKey` refuses unconditionally today, because the API it unlocked was
removed and "a screen that mints a key opening nothing is a lie told to a
customer". That refusal is lifted here, and replaced with the plan gate — the
feature and its door arriving together, as `website` did.

---

## 4. Reading

`GET /v1/resort` and `GET /v1/vacancy?from=&to=` — the published view, wrapped.
Not a second query of the database: the resort's own website and its own API
quoting different prices is the failure this whole design was shaped to avoid.

Two differences from the public site endpoints:

- The resort is the key's, not a slug in the path. A key addresses exactly one
  resort and cannot ask about another.
- It answers whether or not the site is published. Publishing is about the
  brochure; a resort with its own website may never publish one.

---

## 5. Writing

```
POST   /v1/bookings          Idempotency-Key: <caller's own id>
GET    /v1/bookings/:code
POST   /v1/bookings/:code/cancel
```

**Every one of them calls the services the panel calls.** No endpoint here
writes a booking row, a night row or a payment row of its own.

- **Idempotency.** The key is stored with the booking it produced. The same key
  again returns the same booking, with the same code, and creates nothing. A
  different body under a used key is a `409` — it is a bug in the caller, and
  quietly returning the first booking would hide it.
- **The room is chosen by us.** The caller asks for a room *type* and dates; we
  pick a free room. A public API that lets a caller name a room id is an API
  that lets a caller enumerate a resort's inventory.
- **Cancellation goes through the state machine**, so a cancelled booking
  releases its nights exactly as it does from the panel.
- **The booking records the key.** `bookings.apiKeyId`, nullable — not a source
  code from the resort's own editable list, because "where did this come from"
  needs an answer that survives somebody renaming their list.

### 5.1 What `/v1` may not do

No guest accounts. No payments. No reading another resort. No listing guests, no
listing bookings in bulk, no reports: a key is for a resort's own website to
sell its own rooms, and a compromised key should not be a copy of the register.

---

## 6. Webhooks

The resort's site needs to know when a booking changes in the panel — a walk-in
took the last room, the front desk cancelled something.

```
webhook_endpoints   resortId, url, secret, active
webhook_deliveries  endpointId, event, payload, attempts, nextAttemptAt,
                    lastStatus, lastError, deliveredAt
```

- **Events**: `booking.created`, `booking.changed`, `booking.cancelled`,
  `availability.changed`.
- **Signed** — `X-Resort-Signature: sha256=<hmac of the raw body>` with the
  endpoint's own secret, so their site can tell our call from anyone's.
- **Retried** with a widening gap — a minute, five, twenty-five, up to a day —
  and then left failed rather than retried for ever.
- **Visible**: the panel lists deliveries, what came back, and a button to send
  one again.
- **Loud**: an endpoint failing for a day is a resort losing bookings, and
  somebody is told. There are stuck jobs on this platform today that nobody was
  told about; that is the mistake this line exists to not repeat.

Delivery is the sweep's job, not the request's: a booking must not be slower
because somebody's website is down.

---

## 7. Documentation

A resort's developer is the customer here, and an API without documentation is
an API nobody integrates. One page under the panel: the base URL, how to send a
key, every endpoint with a real `curl`, the idempotency rule, and the webhook
signature with the three lines that verify it.

Written from the same types the endpoints use, so it cannot drift into
describing an API we do not serve.

---

## 8. Risks

| Risk | Handling |
|---|---|
| A second path into `bookings` | Every write calls `BookingsService`. Asserted in a test that reads the source |
| A retry making two bookings | `Idempotency-Key` required; the key stores its booking |
| A leaked key emptying the register | Scopes; no bulk reads at all |
| A key outliving its usefulness | Revocation is a row read on every request, not a cached decision |
| One integration exhausting the platform | Rate limit per key, not per IP — an integration is one server |
| A guest enumerating inventory | Room types in, room ids never out |
| Webhooks slowing down bookings | Delivered by the sweep, never in the request |
| A webhook failing silently for a day | Alerting, not just a table |

---

## 9. How it is proved

- A request with no key, a revoked key, a key of another resort, or a `read`
  key attempting a write is refused — each its own test.
- The same `Idempotency-Key` twice creates one booking; a different body under
  it is a 409.
- A booking made through `/v1` holds the same nights, money and code shape as
  one made in the panel — asserted against the panel's own service.
- No `/v1` response contains a room id, a guest of another booking, or anything
  of another resort.
- A webhook body verifies against its signature, and a wrong secret does not.
- A failing endpoint is retried on the sweep's schedule and gives up rather than
  retrying for ever.
- The whole of it walked in a browser and with `curl`, as a resort's developer
  would meet it.
