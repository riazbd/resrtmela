# Resort Mela — Production Readiness Roadmap

> Status audit of what the platform needs to be 100% production-ready.
> Everything below was identified in the 2026-09-07 production audit of the live VPS
> (`194.163.191.50` — API `backresort.rootcodebd.com`, web `resortmela.rootcodebd.com`).

---

## 🔴 Blockers — break real features today

### 1. ~~SMTP credentials are empty on live~~ ✅ DONE (2026-09-07)
**Resolved:** own mail server deployed — HestiaCP Exim on the VPS, `no-reply@rootcodebd.com` (port 587 STARTTLS), app sends via `127.0.0.1`. DNS at Namecheap: SPF + DKIM (`mail._domainkey`) + DMARC all live. Verified by Port25 verifier: **SPF pass, DKIM pass**.

**⚠️ Deployment note:** the API's PM2 process was started with explicit SMTP env vars (`SMTP_HOST/PORT/USER/PASS/FROM`) because stale empty values in the old PM2 env shadowed the `.env`. If you ever recreate the api process, start it with those vars too — the config is saved in `/root/.pm2/dump.pm2`, so `pm2 resurrect` keeps it.

~~**Fix (~10 min):**~~
~~1. Create a Gmail App Password (or a Brevo/SendGrid account).~~
~~2. On the VPS set `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` in `/opt/resortmela/.env`.~~
~~3. `pm2 restart api --update-env` and verify with a test invoice email.~~

### 2. Guest OTP is generated but never delivered
**Where:** `apps/api/src/auth/auth.service.ts` — OTP store is an in-memory `Map` (comment: *"dev-only OTP store; replaced by SMS provider + job queue in phase 6"*). No SMS gateway integration exists.

**Impact:** guests **cannot log in** via the mobile app or the web trips flow — the OTP is never sent to them.

**Fix:**
- Wire a Bangladeshi SMS gateway (BulkSMSBD / AlphaNet / SSL Wireless) into `apps/api/src/notifications/` as the SMS provider adapter (the `NotificationsService.tick` already has the console adapter slot).
- Send the OTP through it in `auth.service.requestOtp()`.
- Add the gateway API key to `.env` (`SMS_PROVIDER_KEY` etc.).

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

---

## 🟠 Important soon

### 5. Online payments (bKash / Nagad / SSLCommerz)
Today the booking flow is "pay at resort" only. `payment_intents` exist with a **mock** provider (`apps/api/src/payments/intents.service.ts`). Needed for true self-service guest booking and for collecting platform subscription dues online.

### 6. Automatic subscription renewal sweep
Renewals are manual (Platform → Resorts → Renew creates the due). Deferred by decision — build a daily sweep that: on `trialEndsAt`/`renewsAt` passing → generate the due → flip `Subscription.status` to `PAST_DUE` when unpaid. Suggested home: a cron-style method next to `sweepAgentDeadlines()` in `apps/api/src/notifications/notifications.service.ts` or a dedicated `subscriptions.sweep()` in `apps/api/src/platform/platform.service.ts`.

### 7. Forgot-password for staff
Only change-while-logged-in exists (`POST /auth/me/password`). Add OTP-based reset reusing the SMS/email channel from blocker #2.

### 8. Mobile app release
The Expo app (`apps/mobile`) is feature-complete in code but not built/published to the Play Store. Guest booking works on the web meanwhile. Requires: EAS build, store listing, `EXPO_PUBLIC_API_URL` already set in `.env`.

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

**Live logins:** super admin `8801700000000 / Super@ResortMela2026` · manager `8801700000001 / Password123!` · agent `8801700000002 / Password123!` (change the super admin password before going fully public).
