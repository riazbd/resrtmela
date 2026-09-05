# ResortHub — Multi-Resort Booking & Activities Platform

> SaaS where multiple resorts manage rooms, bookable activities, agents, guests, and payments.
> Based on the Sky Eco Resort workflow doc (roles/state machine/cash-flow fields) generalized to multi-tenancy.

## 1. Product Surfaces

| Surface | Users | Delivery |
|---|---|---|
| **Admin Dashboard** | Platform super-admin, resort owner/manager, front desk | Web (Next.js) |
| **Agent Portal** | Booking agents | Mode inside mobile app (+ light web) |
| **Guest App** | End guests | Mobile app (Expo → iOS/Android) |
| **Staff Mobile Mode** | Front desk / manager on the go | Same Expo app, role-routed |
| **API Backend** | All surfaces | Single NestJS API + **MySQL 8** |

One backend, one auth system, role-based UIs.

> Ownership model: **ResortHub is our app** — resorts do not own or self-claim tenancy.
> We onboard resorts as tenants, grant them an in-resort administrator login
> (`resort_admin`), and they operate within the permissions we set.

## 2. Roles & Permissions

```
super_admin      US (platform team): create tenants/resorts, grant/resume logins,
                 manage plans, all data
resort_admin     highest role within a tenant resort, assigned BY super_admin;
                 manages that resort's staff, rates, settings, reports
manager          full operational access within assigned resort(s)
front_desk       bookings/payments/check-ins; no rate or user editing
agent            own bookings only, availability view, commission summary
housekeeping     room status only
guest            own profile/bookings/payment history
```

Tenancy isolation (MySQL note): MySQL has **no native Row-Level Security**, so isolation is enforced in three layers:

1. **API guard**: every request carries JWT claims `{userId, role, resortIds[]}`; service/repository functions always filter by `resort_id`.
2. **Prisma client extension**: a scoped tenant client factory that refuses queries without a resort scope for tenant-bound models (compile-time + runtime check).
3. **DB backstop**: least-privilege DB user, foreign keys everywhere, audit log of every mutation.

Agent/guest visibility rules follow doc §1 exactly (agents see only their own bookings' rates/dues; NID/mobile masked unless toggled per resort).

## 3. Data Model (MySQL)

```sql
tenants            id PK, name, slug UNIQUE, plan, status, created_at

resorts            id PK, tenant_id FK→tenants, name, location, timezone,
                   currency_default 'BDT', show_rates_to_agents BOOL DEFAULT FALSE,
                   tax_rate_pct DECIMAL(5,2), settings JSON, status

users              id PK, name, phone UNIQUE, email UNIQUE NULL, password_hash,
                   role ENUM('super_admin','resort_admin','manager','front_desk',
                             'agent','housekeeping','guest'), status

user_resorts       id PK, user_id FK→users, resort_id FK→resorts,
                   commission_rate DECIMAL(5,2) NULL    -- agents can work multiple resorts
                   UNIQUE(user_id, resort_id)

room_types         id PK, resort_id FK, name, max_adults INT, max_children INT,
                   amenities JSON, active BOOL

rooms              id PK, resort_id FK, room_type_id FK, name,
                   base_rate DECIMAL(10,2), status ENUM('active','out_of_service')

rate_plans         id PK, resort_id FK, room_type_id FK, date_from DATE, date_to DATE,
                   price DECIMAL(10,2), active           -- seasonal pricing override

guests             id PK, resort_id FK NULL, -- NULL = global profile linked later
                   full_name, phone, nid_passport_no NULL,
                   phone_key CHAR(64)      -- SHA256(normalized phone) for dedup lookup
                   INDEX(phone_key)

bookings           id PK, code VARCHAR(12),        -- 'BK-00001' sequence per resort
                   resort_id FK, kind ENUM('room','activity','package'),
                   guest_id FK, created_by_user_id FK NULL, agent_user_id FK NULL,
                   source ENUM('direct','agent','facebook','whatsapp','phone','app'),
                   check_in DATE NULL, check_out DATE NULL,   -- room bookings
                   adults TINYINT, children TINYINT,
                   discount DECIMAL(10,2) DEFAULT 0,
                   remarks TEXT,
                   status ENUM('pending','confirmed','checked_in','checked_out',
                               'cancelled','no_show'),
                   payment_status ENUM('unpaid','partial','paid'),
                   booking_date DATETIME, created_at, updated_at, deleted_at
                   INDEX(resort_id, check_in, check_out)
                   UNIQUE(resort_id, code)

booking_items      id PK, booking_id FK, item_type ENUM('room','activity'),
                   room_id FK NULL, activity_slot_id FK NULL,
                   qty INT DEFAULT 1, unit_price DECIMAL(10,2),
                   nights INT GENERATED? -- kept as column computed by app

booking_nights     id PK, booking_item_id FK, room_id FK, night DATE
                   UNIQUE(room_id, night)   -- ★ THE double-booking guard
                   -- one row per night of stay; the unique key makes overlap
                   -- physically impossible under concurrency

activity_catalog   id PK, resort_id FK, name, category ENUM('tour','water_sports',
                   'wellness','dining','entertainment','other'), base_price DECIMAL(10,2),
                   duration_min INT, min_per_slot TINYINT, max_per_slot SMALLINT,
                   description TEXT, photos JSON, active BOOL

activity_slots     id PK, catalog_id FK→activity_catalog, starts_at DATETIME,
                   ends_at DATETIME, capacity SMALLINT, booked_count SMALLINT DEFAULT 0
                   CHECK (booked_count <= capacity)     -- slot capacity guard
                   UNIQUE(catalog_id, starts_at)

payments           id PK, booking_id FK, amount DECIMAL(10,2),
                   method ENUM('cash','bkash','nagad','card','bank','wallet_credit'),
                   kind ENUM('advance','final','refund'),
                   received_by_user_id FK, received_at DATETIME, note VARCHAR(255)

audit_log          id BIGINT PK AUTO_INCREMENT, actor_user_id NULL, resort_id NULL,
                   action VARCHAR(64), entity VARCHAR(32), entity_id BIGINT,
                   diff JSON, ip VARBINARY(16), created_at
                   INDEX(entity, entity_id), INDEX(created_at)

notification_jobs  id PK, channel ENUM('sms','whatsapp','push','email'), to_ref,
                   template VARCHAR(64), payload JSON, send_after DATETIME,
                   sent_at DATETIME NULL, attempts TINYINT, last_error TEXT
```

Computed-on-read (never stored, per doc §5.2):
`nights = check_out − check_in`, `rent = Σ unit_price × qty`,
`due = rent − discount − paid_total`.

Stored procedures NOT used — business logic lives in the NestJS service layer, transactions via Prisma `$transaction`. MySQL specifics:

- Engine: InnoDB, charset `utf8mb4`, collation `utf8mb4_0900_ai_ci`.
- Money as `DECIMAL(10,2)`, never FLOAT/DOUBLE.
- `CHECK(booked_count <= capacity)` enforced since MySQL 8.0.16.
- Booking codes generated in-transaction (`SELECT MAX(...) FOR UPDATE` on a resort counter table `counters(resort_id, kind, next_val)` — avoids MAX race).

## 4. Core Engines

### Availability engine (#1 priority, doc §5.1)

**Rooms:** booking creation runs in one transaction:
1. Validate date range, active room.
2. Materialize nights into `booking_nights`; the `UNIQUE(room_id, night)` rejects any overlapping live booking with ER_DUP_ENTRY → translate to friendly "conflict" response listing conflicting nights.
3. Cancellations/no-shows delete future nights rows; checked-in past nights kept for history/reporting.

This replaces the Postgres exclusion-constraint idea with a MySQL-native guarantee that holds even under concurrent requests.

**Activities:** `UPDATE activity_slots SET booked_count = booked_count + n WHERE id = ? AND capacity - booked_count >= n` — atomic decrement with affectedRows check; rollback transaction if 0 rows.

### Booking state machine (doc §4)

```
Pending ──confirm(admin/staff)──▶ Confirmed ──check-in──▶ Checked_in ──check-out──▶ Checked_out
   │                                   │
   └decline/reject─▶ Cancelled         └no-show(admin/staff)──▶ No_show
Any state ─admin only─▶ Cancelled (frees nights/slot, refund policy applied)
Payment sub-flow parallel: Unpaid ▶ Partial ▶ Paid(due=0)
```

Agents may create/edit only their own pre-check-in bookings; cancellation goes through an approval queue (`status='cancel_requested'` flag → admin decision). Transitions validated server-side by a small state-machine module; every transition written to `audit_log`.

## 5. Screens

### Admin Dashboard (Next.js web)
Resort switcher + cross-resort roll-up overview.
- Dashboard: today's arrivals/departures, occupancy %, dues total, month revenue, cancellations/no-shows
- Bookings table: filters (guest, room, dates, status, source, agent), create/edit/cancel, CSV export matching current sheet's column order (transition continuity, doc §8)
- Availability calendar: rooms×dates grid, color-coded Confirmed green / Cancelled red / No Show brown / Partial orange — same conventions as today's sheet
- Activities manager: catalog CRUD, slot templates (daily recurring generation), occupancy view
- Rooms & rate plans; out-of-service calendar toggle (replaces fake "out of service" bookings BK-00033/34/70)
- Guests directory w/ dedup-by-phone merge tool
- Payments/Dues ledger + outstanding report
- Agents & Sources performance; cancel-request queue; Users/resort management (resort_admin+); Reports & exports; Settings; Audit log

### Guest mobile app (Expo)
Phone OTP onboarding → Discover resorts (list/map, galleries) → Room detail + date picker (live availability) → Activity listings + slots ("add to stay") → Single cart checkout (rooms+activities) → Pay online (bKash/Nagad/card) or "pay at resort" → My Bookings timeline with dues → Profile/history. English/Bangla i18n later.

### Agent portal (mode in same app)
Availability-only calendar (rates hidden unless enabled), New Booking auto-tagged `source=agent, agent_id=self`, My Bookings with due/commission earned, cancel request flow.

### Staff mode (same app)
Today's arrivals/departures, quick check-in/out, record payment, guest lookup by mobile.

## 6. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Monorepo | Turborepo + pnpm | apps/api, apps/web, apps/mobile, packages/db, packages/shared |
| API | NestJS 11 + Prisma ORM → MySQL 8 | typed contracts shared w/ web+mobile; Prisma handles MySQL migrations |
| DB | MySQL 8.x (InnoDB) | PlanetScale/Ferretum compatible if managed hosting wanted; or DigitalOcean Managed MySQL |
| Web | Next.js 14 App Router + Tailwind + shadcn/ui | admin dashboard |
| Mobile | Expo (React Native) | single binary, 3 role modes; EAS builds, OTA updates |
| Jobs/cache | Redis + BullMQ | reminders, slot-recurrence generator, report exports |
| Storage | S3-compatible (R2/S3) | room photos, activity media |
| Auth | Phone OTP (SMS gateway: Twilio/local aggregator e.g. AlphaSMS/BulkSMSBD) + password fallback | JWT with {userId, role, resortIds} claims; refresh tokens |
| Payments | Cash/manual first-class; Stripe/bKash merchant/Nagad merchant behind payment-provider interface | bKash Checkout API for MVP-BD |
| Testing | Vitest (unit) + Playwright (web e2e) + Detox/EAS (mobile smoke) | |
| Hosting start | Vercel (web) + Fly.io/Railway (api+redis) + PlanetScale/DO (mysql) | portable |

## 7. Roadmap

> **Status (Aug 27, 2026): Phases 1–3 SHIPPED & E2E-verified.**
> Phase 1 — backend core: auth, tenancy, rooms/rates, availability + booking engine
> (`booking_nights` guard, BK-code counters), state machine, cancel-request queue,
> payments ledger, dues, audit log.
> Phase 2 — Admin dashboard: login, role-gated shell + resort switcher, KPI dashboard,
> availability calendar (doc color codes), bookings table + new-booking modal + detail
> drawer (payments/transitions/cancel), rooms & seasonal rates, guests, dues, settings.
> Phase 3 — Agent portal (calendar/bookings/profile + commission), staff mobile mode
> (Expo: today's arrivals/departures, check-in/out, collect payment), CSV migration
> engine (dry-run report, guest dedupe by phone, room auto-create, out-of-service →
> room status, advances → ledger, agent auto-attach, counter handoff) — verified by
> importing the real Sky Eco sheet: 89/94 rows in, 2 junk rows skipped, 3 OOS rooms,
> 21 payments, Rikan auto-linked, next code BK-00095.
> Smoke: `apps/api/scripts/smoke.ps1`. Run: `pnpm dev` (api :4000, web :3000).


> **Status (Sep 3, 2026): ALL PHASES + SHEET GAP-CLOSURE SHIPPED & E2E-verified.**
> Phase 1 - backend core: auth, tenancy, rooms/rates, availability + booking engine,
> state machine, cancel-request queue, payments ledger, dues, audit log.
> Phase 2 - Admin dashboard: KPIs, availability calendar, bookings, rates, dues, settings.
> Phase 3 - Agent portal, staff mobile mode, CSV migration (real Sky Eco sheet: 89/94).
> Phase 4 - Guest mobile app: OTP, discovery, availability search, trips, pay-at-resort.
> Phase 5 - Activities: schedules, recurrence generator, atomic seat capacity, add-to-stay.
> Phase 6 - Notifications (dedupe + dispatcher + D-1 sweep), online payments (intents +
> mock gateway, replay-safe), commission/source reports, audit UI.
> Phase 7 - Self-serve signup wizard, billing plans w/ hard caps, auth rate limiting,
> load run (150 req avg 2.7ms).
> Phase 8/9 - Spreadsheet gap-closure (all 12 tabs now covered): Expenses module,
> Restaurant/F&B bills (RES-#####, partial pay, charge-to-room), invoice generation
> (SER-##### + print view), resort settings (check-in/out times, address, contacts),
> management P&L metrics + daily revenue rows.
> Suites: unit 34/34 - staff 13/13 - guest 11/11 - activity 11/11 - phase6 12/12 -
> phase7 13/13 - phase8/9 8/8. Run: pnpm dev (api :4000, web :3000) - pnpm -F @rh/mobile dev.

| Phase | Scope | Est. |
|---|---|---|
| 0 | Freeze schema (Prisma models above), API contract (OpenAPI/tRPC), wireframes, seed data modeled on this exact Sky Eco sheet incl. its quirks | 1 wk |
| 1 | Backend core: tenancy, auth/OTP, resorts/rooms/rate plans, bookings + availability engine, payments ledger, state machine, counters/code generation | 3–4 wk |
| 2 | Admin dashboard MVP: dashboard KPIs, bookings, availability calendar, rooms, payments, guests, CSV export/import matching sheet layout | 3–4 wk |
| 3 | Agent portal + staff mobile mode + data migration job from Sky Eco sheet (dedupe guests by phone_key, preserve BK-codes, convert out-of-service rows into room_status entries) | 2 wk |
| 4 | Guest mobile app: discovery, room search/booking, cart checkout, my-bookings, pay-at-resort | 3–4 wk |
| 5 | Activities module end-to-end: catalog, slots + recurrence engine, capacity booking, bundle pricing, dashboard manager | 2–3 wk |
| 6 | Notifications (check-in reminder, due alerts via SMS/WhatsApp), online payments (bKash/Nagad), commission reports, audit UI polish | 2–3 wk |
| 7 | Tenant self-service onboarding (signup wizard, import tool), billing/plans, hardening & load tests | 2 wk |

MVP cut (Phases 0–4 + activities read-only): ~12 weeks. Full: ~17–22 weeks solo dev.

## 8. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Cash-first habits resist online pay | Manual payment recording is a first-class flow; online optional per resort |
| Agents seeing competitors' data | Masked NID/mobile default ON; per-resort toggle; RLS-equivalent repo scoping tests |
| Excel continuity | Export reproduces exact sheet column order; import wizard for new tenants |
| Concurrent double-bookings | booking_nights unique key + atomic slot counter (§4) — safe at DB level |
| SMS gateway flakiness in BD | notification_jobs retry queue + fallback channels |
| Multi-resort reporting noise | Roll-up dashboards behind owner/admin roles only |

## 9. Migration Plan (Sky Eco sheet → v1)

1. Parse sheet (booking ID, guest, mobile, room, dates, rates, advance...) preserving `BK-#####` as `code`.
2. Dedupe guests by normalized mobile into `guests`.
3. Map sources: blank/Direct→direct, FB→facebook, WhatsApp→whatsapp, Phone Call→phone, named (Rikan etc.)→agent accounts seeded from names found in `Advance received` column.
4. Rows lacking room/rates flagged for review instead of silently imported.
5. "out of service" rows → room `out_of_service` periods, not bookings.
6. Import dry-run diff review before commit; keep original CSV archived per tenant.
