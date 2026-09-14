# A resort's own front door — design

*2026-09-14. Decided in conversation with the owner. Every decision below was
his; the reasoning is written down so a later reader can tell a choice from an
accident.*

---

## 1. The sentence this is built on

> **A resort's public face and a resort's public API are two views of one thing:
> what the resort is selling right now.**

Not two features. One published surface — the resort's identity, its room types,
its rates, and whether anything is free on a given night — rendered for a person
by a website, and served to another program by an API.

The owner's words when the work was framed: *"resort amader platform ei tader
website khulte parbe"* and *"resort er existing website thakle api
intigration"*. Two customers, one underlying answer.

Everything below follows from that sentence. Where the website and the API
disagree about a price, the design is wrong.

---

## 2. Decisions

| Question | Decision |
|---|---|
| What the hosted website does | **Shows, does not sell.** No booking form, no basket, no payment |
| Does it show live availability | **Yes** — pick dates, see what is free and from what price, then phone or WhatsApp |
| Who writes its content | **The owner**, in a panel editor: photos, an introduction, amenities |
| How it looks | **Two or three finished templates**, and the owner picks one |
| Where it lives | **The resort's own domain**, e.g. `skyecoresort.com` |
| What the API can do | **Read and write** — availability, rates, and create/change/cancel a booking — plus webhooks back |
| How a booking from the API is written | **Through the existing booking service.** Never a second write path |
| How such a booking is recognised later | It carries **the API key that made it** |
| Who provisions a domain | **Not the application.** A separate operator step, after ownership is proved |
| Where photos live | **Files on disk behind a storage interface**, served by nginx — not base64 in a database row |
| The plan features | `website` and `public_api`, each shipped **with its gate**, never before it |
| Order | The surface and the site, then domains, then the API |

### 2.1 Why one surface rather than two features

The alternative is a website that queries the database its own way and an API
that queries it another. That is two definitions of "the price of a Deluxe room
on 9 March", and they diverge the first time a discount rule changes. A resort
whose website quotes ৳2,200 while its API quotes ৳2,500 has a problem it cannot
even describe, and the platform gets the support call.

So there is one module — call it the **published view** — and it is the only
thing that knows how to answer a public question about a resort. The site
imports it. `/v1` wraps it in HTTP. Neither computes anything of its own.

### 2.2 Why the website does not take bookings

The owner chose a brochure, and the choice is worth recording because it is not
a limitation — it is what makes phase 1 small enough to be good.

A booking form on a public page is a different animal: money, fraud, holds,
expiry, cancellation policy, refunds, and a guest who needs to reach somebody
when it goes wrong at 11pm. Showing what is free and a phone number is a
complete product on its own, and it is the product most resorts in this market
actually run.

The API is a different case (§7) and it is deliberately not the same decision:
there, the booking arrives from a system the resort itself operates and is
accountable for.

---

## 3. What this is not

- **Not a website builder.** No drag-and-drop, no page tree, no theme store, no
  half-finished starting point for the owner to complete. What the owner picks
  is one of a small number of **finished** templates — two or three, each
  designed properly — and fills it with their own photographs, words, colours
  and logo. A resort that wants something other than those has its own website
  already, and that is what the API is for.
- **Not a channel manager.** No Booking.com, no Agoda, no inventory sync.
- **Not a guest account.** Nobody logs in to a resort's site. There is nothing
  to log in to.
- **Not a second booking engine.** §7.2 is emphatic about this.

---

## 4. The published view

The one module both faces read. It answers exactly four questions, and nothing
else is public.

| Question | Source | Notes |
|---|---|---|
| Who is this resort | `Resort` + the new profile row | name, address, contact, map point, logo, colours |
| What can I stay in | `RoomType` (active only) | name, description, occupancy, photos, amenities |
| What does it cost | the resort's own rate rules | the same numbers the panel quotes, discounts applied |
| Is anything free between two dates | the availability service | **a count per room type, never a room number** |

Three rules govern it:

1. **It never exposes an internal id that means anything.** A room type is
   addressed by a slug; a room is never addressed at all.
2. **It answers for active resorts on a plan that includes the feature, and for
   nobody else.** A suspended resort's site goes dark, and says why in one
   sentence — not a stack trace, not a 404 that looks like the business closed.
3. **It shows counts, not the register.** "3 Deluxe free" is a fact about
   inventory. "Room 102 is free because the Rahmans checked out" is somebody's
   private business.

### 4.1 Availability on a page anyone can load

This is the one place phase 1 touches something expensive. A public date search
runs the same query the panel's calendar runs, and it can be run by anybody,
repeatedly, from anywhere.

- **Cache by (resort, date range), short TTL** — 60 seconds is honest for a
  brochure and turns a crawl into one query.
- **Clamp the range** — a request for five years is a mistake or an attack;
  answer at most a few months.
- **Rate-limit per IP** on the public path, independently of anything else.
- **Never block the page on it.** The site renders and the availability panel
  fills in; a slow or failing lookup costs a widget, not the resort's front
  page.

---

## 5. Phase 1 — the surface and the site

### 5.1 New data

| Table | Why |
|---|---|
| `resort_sites` | one row per resort: slug, published flag, headline, introduction, amenity list, map point, theme colour, social links |
| `resort_photos` | many per resort, optionally attached to a room type; ordering, alt text, the stored file |
| `uploads` | the storage record: path, byte size, media type, checksum, who uploaded it |

`Resort` gains a **unique slug**. It has none today (the tenant does), and the
site needs an address that is stable, readable and not the primary key.

### 5.2 The site itself

Served by the existing Next application, selected by **`Host` header in
`middleware.ts`** — the app has no middleware today, so this is the first one and
it should stay the only routing decision it makes. A request whose host is not
the console and not the marketing site is looked up as a resort domain; a hit
renders the site, a miss falls through to the marketing site.

One app rather than two: the console and the marketing pages already share this
one, and a second Next application means a second build, a second pm2 process,
and a design system maintained twice.

Pages: **one**. A single long page — cover, introduction, rooms with prices,
amenities, a photo gallery, where it is, how to reach them — plus a per-room-type
section addressable by anchor. A brochure is not a site map.

**Templates.** Two or three, chosen in the editor and switchable at any time
without touching a word of content. They are not themes in the CSS sense and
they are not configuration: each is a real layout with its own typography,
rhythm and cover treatment, and each is designed to look like somebody made it
on purpose. What they share is the shape of their input.

That shape is the contract, and it is what keeps this from becoming a builder:
every template is a component taking the same published view (§4) and nothing
else. A template cannot ask for data the others cannot have, so adding a fourth
later is one file and no migration — and a resort switching template keeps
everything it wrote.

The template name is a **code-declared vocabulary**, validated against the
registry the same way a plan feature is. A name the code has never heard of
cannot render anything, so it is not a value the database is allowed to hold.

What earns its keep beyond looking right:

- **Found on Google.** Per-page title and description from the resort's own
  words, a sitemap, canonical URLs, and `schema.org/Hotel` structured data with
  rooms and prices, so a search result can show a price and a photo. For most
  of these resorts this will be the first time they are indexed at all, and it
  is the single most valuable thing the site does.
- **Bengali and English**, because the console already carries both and a resort
  in Sylhet has guests who read each.
- **Fast on a phone on mobile data.** Statically rendered, revalidated when the
  owner saves; images resized on upload and served in modern formats.

### 5.3 The editor

A tab in Settings. Photographs, a headline, an introduction, the amenity
checklist, the map point, a theme colour, and a **Preview** that opens the real
page before anyone else can see it. Publishing is an explicit act, and
unpublishing is one click — a resort must be able to take its own site down
without asking us.

### 5.4 Files

There is no file storage today; the brand logo is base64 inside a database row,
which is fine for one small image and wrong for a gallery.

- One narrow interface — `put`, `url`, `remove` — with a disk implementation
  writing under a single directory outside the repository, served by nginx.
- **Every upload is re-encoded**, never stored as received: it fixes the size,
  strips EXIF (which carries GPS and camera serials), and guarantees the bytes
  we serve are an image and not something wearing an image's name.
- Limits per resort, so one enthusiastic owner cannot fill the disk the whole
  box shares.
- **The backup story changes with this.** Today a backup is a database dump and
  that is the whole state. From here it is a dump *and* a directory, and a
  restore that forgets the directory restores a site full of broken images.
  Phase 1 is not done until the backup covers both and a restore has been
  proved.

### 5.5 Addressing, before domains exist

`resortmela.com/r/<slug>`, working from the first day. Phase 2 changes the
address and nothing else, which is what makes it safe to ship separately.

### 5.6 The feature and its gate

`website` joins `PLAN_FEATURES` **in this phase, with the gate**: publishing is
refused without it, and an already-published site of a resort whose plan loses
the feature stops serving. A plan feature that gates nothing is a switch wired
to a light that is always on.

### 5.7 What proves it

- The published view returns the same price the panel shows for the same room
  on the same night — asserted against the panel's own service, not against a
  copied number.
- A suspended resort's site does not serve.
- A resort whose plan lacks `website` cannot publish, and one that loses it
  stops serving.
- No public response contains a room id, a guest name, or a booking.
- An upload of a file that is not an image is refused; an upload with EXIF GPS
  comes back without it.
- The page renders, in a real browser, with its prices and its availability
  panel, at phone width.

---

## 6. Phase 2 — the resort's own domain

Outlined here; it gets its own spec.

The shape: the owner types their domain in the panel, we display a `TXT` record,
they add it, we check it, and only then is the domain **verified**. Verified
domains are provisioned by a **separate operator step** — never by the web
process.

**One rule, and it is not negotiable.** This server hosts a dozen other
businesses. The application must never write nginx configuration, never run
certbot, and never touch a file Hestia owns. Provisioning writes only into one
directory of our own, included once from one line, and every certificate is
issued per domain over webroot. A mistake there is not our outage; it is
somebody else's.

Provisioning before verification would let anyone claim a domain they do not own
and obtain a certificate for it. Verification is the whole security of this
phase.

---

## 7. Phase 3 — `/v1` and webhooks

Outlined here; it gets its own spec.

### 7.1 The keys

`api_keys` already holds what a key needs — a prefix, a hash, an active flag, a
last-used stamp. What does not exist is anything that reads one. Phase 3 writes
the guard, and with it:

- **Scopes per key** — read, or read and write. A resort whose site only shows
  availability should not hold a key that can create a booking.
- **Rate limits per key**, so one broken integration cannot take the platform
  down for everybody else.
- **Every write audited** against the key, not against a person.

### 7.2 Writing a booking

**Through `BookingsService`, always.** The guarantee that two guests never get
the same room on the same night is a `UNIQUE` constraint reached through that
service; an endpoint that writes booking rows itself would be a second door into
the one room in the building that must never have two.

Two consequences:

- **An idempotency key is required on creation.** A network timeout followed by
  a retry must produce one booking, not two. This is the single most important
  detail in a booking API and it is cheap to build and expensive to add later.
- **The booking records the key that made it.** Not a source code from the
  resort's own editable list — a direct link to the key. "Where did this booking
  come from" then has an exact answer, and revoking a key makes every booking it
  created findable.

### 7.3 Webhooks

The resort's site needs to know when a booking changes in the panel. That means
outbound HTTP with retries, and outbound HTTP with retries is a queue.

- Its own table, with attempts, next attempt, and the last response.
- **Signed** — an HMAC of the body with a per-resort secret — so their site can
  tell our call from anyone else's.
- **Visible in the panel**: what was sent, what came back, and a button to send
  it again.
- **Failure is loud.** There are stuck jobs on this platform today that nobody
  was told about. A webhook endpoint that has been failing for a day is a
  resort losing bookings, and somebody must be told.

`public_api` joins `PLAN_FEATURES` in this phase, with its gate.

---

## 8. Risks recorded

| Risk | Where | Handling |
|---|---|---|
| A public page that runs the panel's availability query | §4.1 | cache, clamp, rate-limit, never block the render |
| Disk filled by uploads on a shared box | §5.4 | per-resort limits, re-encoding, monitoring |
| A restore that forgets the files | §5.4 | backup covers both, proved by restoring |
| nginx or TLS changes touching other tenants | §6 | one directory of ours, one include, operator-run |
| A certificate issued for a domain we were not given | §6 | verification before provisioning, always |
| A second path that writes bookings | §7.2 | there is one service and the API calls it |
| A retried request creating two bookings | §7.2 | idempotency key required |
| A webhook failing quietly for a day | §7.3 | alerting, not just a table |

---

## 9. Order, and where to stop

1. **The published view and the site** (§5) — the product, at our own address.
2. **The domain** (§6) — the address changes; nothing else does.
3. **`/v1` and webhooks** (§7) — a different customer and a different security
   surface.

Each phase is deployable and each is reversible on its own. Phases 2 and 3 are
written up separately before either is built; this document is the shape they
have to fit.

**Stop after phase 1 and look.** A brochure site that is fast, truthful and
found on Google may be most of the value here, and what a resort asks for after
using one for a month is better information than anything decided today.
