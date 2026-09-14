# A resort brings its own domain — design

*2026-09-15. Phase 2 of [a resort's own front door](2026-09-14-a-resorts-own-front-door-design.md).
Phase 1 built the site and put it at `resortmela.com/r/<slug>`; this moves it to
`skyecoresort.com` and changes nothing else.*

---

## 1. The sentence this is built on

> **The riskiest part of this feature is not in the application.**

Phase 1 was code, and code that is wrong fails a test. This phase writes files a
web server reads and asks a certificate authority for certificates, on a box
that hosts a dozen businesses that are not ours. A mistake here is not our
outage.

Everything below follows from that. The application never writes nginx
configuration, never runs certbot, and never touches a file Hestia owns.

---

## 2. Decisions

| Question | Decision |
|---|---|
| Who may claim a domain | Only somebody who can put a record in its DNS |
| How that is proved | A `TXT` at `_resortmela.<domain>` holding a token we generate |
| What provisions the vhost and the certificate | **An operator script**, run by a person or a timer — never the API |
| Where its files go | `/etc/nginx/conf.d/domains/resortmela-<domain>.conf`, picked up by the wildcard already in `nginx.conf` |
| How a request finds its resort | nginx proxies unchanged; Next's middleware looks the host up and rewrites to `/r/<slug>` |
| `www` and the apex | Two domains, claimed separately, both allowed |
| How many domains a resort may have | Several. One is the canonical one, and the others redirect to it |
| An unknown host | Falls through to the marketing site, exactly as today |

### 2.1 Why verification cannot be skipped

Provisioning issues a certificate for a name. A platform that will provision any
name somebody types is a platform that will obtain a certificate for a domain
its customer does not own — and, worse, will serve that customer's content at
somebody else's address the moment DNS points there.

`TXT` rather than a file at `/.well-known/`: the file check only proves the
domain already points at us, which is a chicken-and-egg problem for a domain
that has never pointed anywhere. The `TXT` can be added while the site is still
live somewhere else, which is exactly when a resort would want to do it.

### 2.2 Why an operator step rather than a service account

The alternative is the API writing to `/etc/nginx` and shelling out to certbot,
which means the Node process runs as root or holds a sudo rule that amounts to
the same. A bug in a request handler then edits a web server that serves eleven
other businesses.

The operator script reads only verified rows, writes only files whose names it
generates, reloads nginx only after `nginx -t` passes, and is the one thing on
the box that can do any of it.

---

## 3. The model

```
resort_domains
  id, resortId, host (unique), token,
  verifiedAt, provisionedAt, canonical, createdAt
```

- **`host`** is unique platform-wide: two resorts cannot claim one name.
- **`token`** is generated when the row is created and never shown again after
  verification.
- **`verifiedAt`** null means the DNS record has not been seen. Nothing is
  provisioned and nothing resolves.
- **`provisionedAt`** is written by the operator script, so the panel can say
  "waiting for us" rather than leaving the owner wondering.
- **`canonical`** — one per resort. The others redirect to it, so a page is not
  indexed twice under two names.

### 3.1 What the owner sees

Three states, and the screen says which: **waiting for your DNS record** (with
the exact record to add and a Check button), **verified, waiting for us**, and
**live**. A domain can be removed at any point; removing it takes the site off
that address on the next provisioning run.

---

## 4. Serving

nginx passes the request through with its `Host` intact. Next's middleware —
which does not exist yet, and whose whole job is this — asks the API which
resort answers at that host and rewrites `/` to `/r/<slug>`.

- The lookup is one indexed query behind a cached fetch, tagged so that
  verifying, removing or renaming invalidates it immediately.
- A host we do not know rewrites nothing: the marketing site answers, which is
  what happens today and is the right answer for a stray DNS record.
- `/_next/`, `/uploads/` and the API's own paths are never rewritten. A page
  that renders and then loads none of its own JavaScript looks like a styling
  bug and is not one.

**The middleware is the one routing decision this application makes, and the
rule lives in a pure function with its own tests.** Read it wrong and the
console is served at a customer's domain, or a customer's site where the console
should be.

---

## 5. Provisioning, precisely

The script, run on the server:

1. Read verified, unprovisioned domains from the database.
2. For each, obtain a certificate over the webroot — one certificate per name.
3. Write `/etc/nginx/conf.d/domains/resortmela-<domain>.conf`: a port-80 server
   that answers ACME and redirects everything else, and a port-443 server that
   proxies to `127.0.0.1:3000` with `Host` preserved.
4. `nginx -t`. **Only then** reload.
5. Write `provisionedAt`.

Three rules it never breaks:

- It writes only files matching `resortmela-*.conf`. Hestia names its own
  `<domain>.conf`, so the two cannot collide and the script can never overwrite
  a file it did not create.
- It edits `nginx.conf` never. The wildcard include is already there.
- A failed `nginx -t` leaves the previous configuration loaded and stops.

Removal is the same in reverse, and deliberately leaves the certificate alone: a
certificate for a name nobody serves is harmless, and deleting one is how you
find out about the other thing that was using it.

---

## 6. What this does not do

- **No wildcard certificate**, and no DNS API. One certificate per name, over
  the webroot, which needs nothing from the resort but an A record.
- **No automatic DNS.** We show the records; the owner or their registrar adds
  them.
- **No redirect from the old `/r/<slug>` address.** It keeps working. A resort
  that has shared it has shared it.

---

## 7. Risks

| Risk | Handling |
|---|---|
| A certificate issued for a domain we were not given | Verification before provisioning, always |
| Overwriting another tenant's vhost | Only ever writes `resortmela-*.conf` |
| A bad config taking every site on the box down | `nginx -t` before reload; a failure stops and changes nothing |
| The Node process gaining root | It never touches any of this |
| Rate limits at Let's Encrypt | One certificate per name, provisioned in batches, failures retried on the next run rather than in a loop |
| A resort pointing DNS at us and never verifying | Nothing is provisioned, nothing resolves, the marketing site answers |

---

## 8. How it is proved

- A domain cannot be verified while the `TXT` is absent or wrong.
- Two resorts cannot claim one host.
- An unverified domain resolves to nothing.
- The middleware rewrites a known host and leaves the console's own hosts alone
  — the pure rule, with its own tests, including the malformed `Host` headers a
  client is free to send.
- Removing a domain stops it resolving on the next request, not the next
  deploy.
- The provisioning script, dry-run on the server, writes a config that
  `nginx -t` accepts and touches nothing else. **Verified by reading the diff
  before anything is reloaded.**
