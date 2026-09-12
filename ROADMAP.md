> **Start with [STATUS.md](STATUS.md)** — it says where the project stands, what is left, and how these documents relate.

# Resort Mela — Production Readiness Roadmap

> Status audit of what the platform needs to be 100% production-ready.
> Everything below was identified in the 2026-09-07 production audit of the live VPS
> (`194.163.191.50` — API `backresort.rootcodebd.com`, web `resortmela.rootcodebd.com`).

---

## ✅ Fixed 2026-09-09 (code audit)

Branch `fix/audit-2026-09-09`. Each fix was written test-first. This table is a
summary of the first batch only — **[STATUS.md](STATUS.md) has the full account
and the current test count**, which this section is not kept in step with.

| What was wrong | Effect |
|---|---|
| **Migrations could not build a database.** Six migration files carried a UTF-8 BOM that MySQL rejects, and history was 16 tables behind the schema — everything after 2026-09-03 had been applied with `db push` | A fresh environment came up broken. With no backups (blocker 3) there was no recovery path at all |
| **Booking money computed four different ways** | Guests were quoted one night's due for a whole stay; the daily revenue report ignored nights and discounts and double-counted room-charged F&B; a FLAT-commission agent saw ৳75,000 where the owner's report said ৳1,000 |
| **`POST /v1/bookings` wrote `createdById: 0`**, a foreign key to a user that cannot exist | The public API a resort's own website uses could never have succeeded. It also ran as SUPER_ADMIN, one bug away from reaching other tenants |
| **OTP codes lived in memory**, in the clear, seeded from `Math.random` | Restarting the API dropped every login in flight, and auth could not run on more than one process |
| **Two plan tables, only the hard-coded one enforced** | Editing a plan's room limit in Platform → Plans did nothing; resort caps disagreed depending on which route added the resort |
| **Mojibake in shipped strings** | Invoices printed `Snorkelling <?> 2`; the homepage rendered the taka sign as `a§³` |

Deployment note: live already has the Sept tables via `db push`, so it needs
`prisma migrate resolve --applied 20260908120000_sept_platform_roles_payroll_cms`
once, then `prisma migrate deploy` for the new `otp_codes` table.

---

## 🔴 Blockers — break real features today

### 1. ~~SMTP credentials are empty on live~~ ✅ DONE (2026-09-07)
**Resolved:** own mail server deployed — HestiaCP Exim on the VPS, `no-reply@rootcodebd.com` (port 587 STARTTLS), app sends via `127.0.0.1`. DNS at Namecheap: SPF + DKIM (`mail._domainkey`) + DMARC + MX (`mail.rootcodebd.com`) + `mail` A record — all live. Verified by Port25 verifier: **SPF pass, DKIM pass**. Exim `message_id_header_domain = rootcodebd.com`, hostname = PTR (`vmi2967410.contaboserver.net`), one-click `List-Unsubscribe` on campaigns.

**Reputation warm-up (chosen path A, 2026-09-07):** domain is new — Gmail/Outlook may spam-folder early mail. Placement improves with: recipients marking "Not spam", replies, and regular transactional traffic. Expect inbox placement within 1–3 weeks. If inbox delivery becomes business-critical sooner, wire a Brevo/SendGrid relay (`email.service.ts` swap, ~10 min).

**⚠️ Deployment note:** the API's PM2 process was started with explicit SMTP env vars (`SMTP_HOST/PORT/USER/PASS/FROM`) because stale empty values in the old PM2 env shadowed the `.env`. If you ever recreate the api process, start it with those vars too — the config is saved in `/root/.pm2/dump.pm2`, so `pm2 resurrect` keeps it.

~~**Fix (~10 min):**~~
~~1. Create a Gmail App Password (or a Brevo/SendGrid account).~~
~~2. On the VPS set `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` in `/opt/resortmela/.env`.~~
~~3. `pm2 restart api --update-env` and verify with a test invoice email.~~

### 2. Guest OTP — EMAIL LIVE, SMS PENDING (updated 2026-09-07)
**Superseded (2026-09-11):** guests, the GUEST role, and this OTP door are gone — see `docs/superpowers/specs/2026-09-11-two-sided-platform-design.md` §4.4. Left below for the history of what SMS activation would have needed, not as a live plan.

**Current state:** guests verify by **email OTP** — a 6-digit code is emailed (SMTP is live). The unified endpoint accepts either channel:

- `POST /auth/otp/request` with `{ email }` (works today) or `{ phone }` (auto-activates when the SMS gateway gets a sender ID)
- `POST /auth/otp/verify` with `{ email|phone, code }` returns `{ accessToken }` — finds or creates the GUEST account
- `User.phone` is now nullable (email-only guest accounts supported)

**SMS path fully built but dormant** — SSL Wireless iSMS Plus adapter exists (`apps/api/src/notifications/sms.service.ts`: `user` + SHA-256 `hash` + `sid`, auto Bangla/Unicode detection). Credentials already in the VPS `.env`; only `SMS_SENDER_ID` is empty.

**To activate SMS:** log into https://ismsplus.sslwireless.com (user: mishatil) -> copy the approved sender ID -> set `SMS_SENDER_ID` in `/opt/resortmela/.env` -> recreate the api PM2 process (with the SMTP env vars, see blocker 1 note) -> test an OTP to a real phone.

### 3. No database backups
**Where:** VPS crontab is empty. All business data lives in MariaDB `resortmela` with zero backups.

**Fix (~15 min):**
1. Nightly cron: `mysqldump -u resortmela -p… resortmela | gzip > /var/backups/resortmela-$(date +%F).sql.gz`, keep 14 days.
2. Offsite copy (S3 / Backblaze B2 / another server) — an on-server backup dies with the server.
3. Test a restore once.

### 4. No monitoring / alerting
**Where:** PM2 restarts crashed processes but nobody is told when things break.

**Fix (~10 min):**
- UptimeRobot (or similar) pinging `https://backresort.rootcodebd.com/health` + `https://resortmela.rootcodebd.com` with email/SMS alerts.
- Optional: Sentry DSN wired into the API for error tracking.

### 4b. Sept 8 corrections batch — ✅ DONE & LIVE (2026-09-08)
Delivered per client corrections list (commit `bc5d9fa` + `651953c`, deployed & smoke-tested on live):

1. **Permissions matrix (Paradox-style)** — per-resort `roles` table (Administrator/Manager/Front Desk seeded automatically), checkbox permission editor in Settings → Permissions, users get a permission set at creation; server enforcement via `PermissionsService.require()` on the sensitive endpoints. UI nav/actions gate off `/auth/permissions?resortId=`.
2. **Payroll** — `/payroll` page: staff list (name/phone/designation/salary), monthly salary sheet with Pay / Undo per employee, totals. Employees with history are deactivated, never hard-deleted.
3. **Multi-resort per owner** — `PlatformPlan.maxResorts` (STARTER 1 / GROWTH 2 / CHAIN 10, editable in Platform → Plans), owner adds resorts from the header `+` button, existing resort dropdown switches (client-side active resort).
4. **P&L statement** — Reports page: separate **Resort** / **Restaurant** / **Combined** columns with payroll, per-category expense drilldown; expenses now carry a `RESORT|RESTAURANT` scope.
5. **Food packages** — created/managed in Restaurant page, one-click buttons on every POS ticket.
6. **Agent invite by email** — Settings → Agent access: email invite with login credentials + commission terms (verified delivered to Gmail).
7. **Activity log** — search (name/phone/email/action) + owner delete (permission `activities.delete`).
8. **Agent corrections** — walk-in bookings **blocked** for agents (server + UI), agency sub-users (agent's own staff accounts), actual vs agent price shown on the room grid.
9. **Walk-in form** — name, phone, email, adults, **extra persons** (charged per night via `EXTRA_PERSON` booking items at the room-type rate; requires the room type's extra-person checkbox + rate).
10. **Invoice PDF download** — client-side jsPDF+html2canvas button on `/invoice/[id]`.
11. **Front-end CMS** — Platform → Website CMS tab (hero badge/title/subtitle/CTA, bottom CTA), public `GET /cms`, homepage falls back to defaults for empty values.
12. **Login** accepts phone **or** email (agents invited by email can log in with their email).

---

## 🟠 Important soon

### 5. Online payment gateway — FUTURE (offline entry works today)
**Current state:** guests book "pay at resort". All payments — advances, F&B, dues, agent wallets — are **manual/offline entry** in the console (cash / bKash-manual / Nagad-manual / card-manual). Fully functional today.

**Future work:**
1. Choose PSP: bKash PGW, Nagad, or SSLCommerz (aggregator for all).
2. `apps/api/src/payments/intents.service.ts` already has the `payment_intents` table + a mock provider — swap the mock for the real PSP adapter.
3. Guest flow: "Pay now" button on the trip page -> hosted checkout -> webhook marks the intent paid -> `Payment` row + booking `paymentState` recompute.
4. Platform subscription dues get the same PSP later.
5. PSP merchant credentials + webhook secret in `.env`.

### 6. Automatic subscription renewal sweep
Renewals are manual (Platform → Resorts → Renew creates the due). Deferred by decision — build a daily sweep that: on `trialEndsAt`/`renewsAt` passing → generate the due → flip `Subscription.status` to `PAST_DUE` when unpaid. Suggested home: a cron-style method next to `sweepAgentDeadlines()` in `apps/api/src/notifications/notifications.service.ts` or a dedicated `subscriptions.sweep()` in `apps/api/src/platform/platform.service.ts`.

### 7. Forgot-password for staff
Only change-while-logged-in exists (`POST /auth/me/password`). Add OTP-based reset reusing the SMS/email channel from blocker #2.

**Superseded (2026-09-11):** built, but not as OTP — a mailed single-use reset link, requestable by either email or phone. See `docs/superpowers/specs/2026-09-11-two-sided-platform-design.md` §4.4.

### 8. Mobile app release
**Restarted (2026-09-13), for a different audience.** The guest app that lived here was deleted the same morning — it called endpoints removed on 2026-09-11, and had never been built once: no `android.package`, no bundle identifier, no APK. The replacement is for the two audiences that pay, resort staff and agents, and its first act was the thing the old one never managed: an installable build. Design in `docs/superpowers/specs/2026-09-13-mobile-app-design.md`; every APK produced is listed in `apps/mobile/RELEASES.md`.

Release 0 hosts the console in a native shell, so both panels work from the first build, and native screens replace it one at a time. Still open: push notifications, the offline read cache and write queue, iOS.

### 8b. The console on a phone — ✅ DONE (2026-09-13)
**What was wrong,** measured at 390px: the page itself did not overflow, which is why this had passed for "responsive", but the content did. Platform → Resorts rendered a **1009px** table reachable only by dragging inside its card; the sticky header covered the tab strip so *Billing policy* could not be tapped at all; `/settings` scrolled 674px sideways; and the bookings page alone had 621 elements below 13px.

**What changed.** Forty tables became `<Table>` from `components/patterns.tsx`, which is a table above `sm` and one card per row below it, each cell labelled from the table's own `<thead>`. `min-w-0` on the content column — a flex item will not shrink below its content, so one wide toolbar had been stretching the column and the header with it. Tab strips wrap instead of scrolling out of reach. A type floor on phones only: `text-[10px]`/`text-[11px]` render at 12px, `text-xs` at 13px.

**Where it stands now,** same measurement, both panels, 23 screens: nothing drags sideways, no control is covered, and the only text under 12px is the notification bell's "9+" badge, which is a mark rather than prose.

Two tables stay tables on purpose: `/invoice/[id]` and the stay bill. A bill is a document, and the invoice is what html2canvas turns into the PDF a guest receives.

### 9. Terms of Service & Privacy Policy pages
Public signup exists (`/signup`) — legally the SaaS should ship both pages. Add `apps/web/src/app/(public)/legal/...` and link from the footer + signup form.

### 10. Custom domain
Currently on `resortmela.rootcodebd.com` / `backresort.rootcodebd.com`. When ready: point DNS → VPS IP `194.163.191.50`, add Nginx server blocks (copy the existing domain configs — note Nginx binds the specific IP, and the Hestia symlinks were removed on purpose), re-run certbot for the new domain, update `CORS_ORIGIN` + `NEXT_PUBLIC_API_URL` in `.env`, rebuild web.

---

## 🟡 Nice-to-have

11. **Full Bangla translation** — nav + key labels are bilingual (`apps/web/src/lib/i18n.tsx`); page content is English-only.
12. **Report exports** — CSV/PDF month-end packs (reports page renders on screen only).
13. **Room photos / gallery** — room types have no images; homepage + booking cards use gradient placeholders.
14. **OTA channel sync** (Booking.com/Airbnb) — the public API (`/v1/*`, `apps/api/src/platform/public-api.controller.ts`) is the foundation; a channel manager adapter would go on top.
15. **Website embed themes** — hosted booking page styling per resort (logo/colors from `Resort.settings`).

---

## ✅ What already works (for reference)

- Multi-tenant SaaS core: tenants → resorts → roles (SUPER_ADMIN / RESORT_ADMIN / MANAGER / FRONT_DESK / AGENT / HOUSEKEEPING / GUEST), users & roles UI, role activity log
- Booking engine: conflict-proof calendar (`booking_nights` UNIQUE guard), click-to-book, groups, check-in/out lifecycle, cancel requests, guest booking (public web + trips)
- Money: payments, dues, expenses, F&B POS (walk-in + room tabs), separate resort vs restaurant revenue, FY reports
- SaaS layer: subscriptions + dues + plans editor, platform dashboard, MRR, subscription calendar, login-as impersonation (audited)
- Agents: discovery + access requests + activation, wallets (top-up/payout/commission APIs), payment deadline policy (24/48/72h) with admin late-approval
- Extras: discount engine (per-room/resort-wide, auto-applied), extra-person rates, invoice PDF (print) + email, in-app notification bell, bulk email credits/campaigns, public API keys (`/v1/*`), rate limiting on auth
- Deploy: VPS Node 20 + MariaDB 11.4, PM2 (`api` :4000, `web` :3000), Nginx + Let's Encrypt SSL, git pull deploys from `github.com/riazbd/resrtmela.git`

### 🔴 Credentials — rotate now (2026-09-09)

The live super admin, manager and agent passwords were committed here in plain
text and pushed to `github.com/riazbd/resrtmela.git`. They have been removed
from this file, but **they remain readable in commit `7ac3ba8`**, so removing
them changes nothing on its own.

1. **Rotate all three passwords on live** — the committed ones must be treated
   as public. Start with the super admin, which can impersonate any resort
   admin or agent.
2. Decide about history. Purging `7ac3ba8` with `git filter-repo` rewrites
   every commit after it, so anyone else with a clone has to re-clone. If the
   passwords are rotated, leaving history alone is reasonable — it then only
   leaks that those strings were once valid.
3. Keep credentials out of the repo from here on: the accounts belong in a
   password manager, and `.env` is already git-ignored.

Live account **identifiers** (safe to record): super admin `8801700000000`,
manager `8801700000001`, agent `8801700000002`.
