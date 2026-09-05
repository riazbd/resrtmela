> **EMAIL SYSTEM ADDED (Sep 4, 2026):** SMTP channel via Nodemailer (Gmail app-password or any SMTP) Ã¢â‚¬â€ booking confirmations, payment receipts, D-1 reminders all route EMAIL when the guest has an email on record, SMS-to-phone otherwise; email-invoice endpoint sends the bilingual invoice as HTML; falls back to console in dev. Verified end-to-end.
>
> **REBUILD COMPLETE (Sep 4, 2026): R1-R6 all shipped & verified.** R6 = web guest booking. Day Sheet reconciled 6,330/6,331 checks, 0 unexplained. P&L matches workbook with one classified adjustment (cancelled BK-00005, 8,000 BDT). Bangla-first UI, F&B POS charge-to-room, expenses cashbook, tour groups, walk-in path, collector view, FY reports, bilingual invoices, plans, hardening, email system, web guest booking.

# Resort Mela ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Replan v2 (evidence-based)

> Written after a full, structured read of all 12 tabs of the live workbook
> (row counts, cell semantics, Bangla content, date ranges, cross-tab arithmetic).
> Supersedes the phase plan's UI/UX assumptions. Engine (availability guard,
> ledger, tenancy, auth) is retained; the product surface is rebuilt around what
> the workbook actually IS.

## 1. What the workbook really is (evidence)

| Tab | Size | What it actually is |
|---|---|---|
| 5 Bookings | 94 rows | Source of truth for stays, cash terms (rent/discount/advance/due) |
| 7 Daily balance | **321 rows ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 01-Jul-2027** | Receivables calendar: cell = "guest ÃƒÂ¢Ã‹â€ Ã¢â‚¬â„¢ ÃƒÂ Ã‚Â§Ã‚Â³due" per room per night. Hand-maintained. Rows pre-filled a YEAR ahead |
| 8 Occupancy grid | **346 rows ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 26-Jul-2027** | BOOKED/AVAILABLE per room per day ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â a boolean grid maintained BY HAND from bookings. Pure duplication |
| 11 Daily revenue | **346 rows** | Net room revenue per night = rent ÃƒÂ¢Ã‹â€ Ã¢â‚¬â„¢ discount (verified: BK-00003 6500ÃƒÂ¢Ã‹â€ Ã¢â‚¬â„¢2500 ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 4000 ÃƒÂ¢Ã…â€œÃ¢â‚¬Å“; BK-00020 6500ÃƒÂ¢Ã‹â€ Ã¢â‚¬â„¢975 ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 5525 ÃƒÂ¢Ã…â€œÃ¢â‚¬Å“). Also hand-maintained |
| 4 Expenses | 77 rows, **48 Bangla categories** | Daily kitchen/ops cashbook (ÃƒÂ Ã‚Â¦Ã‚Â¸ÃƒÂ Ã‚Â¦Ã‚Â¬ÃƒÂ Ã‚Â¦Ã…â€œÃƒÂ Ã‚Â¦Ã‚Â¿, ÃƒÂ Ã‚Â¦Ã‚Â¬ÃƒÂ Ã‚Â¦Ã‚Â¾ÃƒÂ Ã‚Â¦Ã‚ÂÃƒÂ Ã‚Â¦Ã‚Â¶, ÃƒÂ Ã‚Â¦Ã‚Â¨ÃƒÂ Ã‚Â¦Ã‚Â¾ÃƒÂ Ã‚Â¦Ã‚Â¸ÃƒÂ Ã‚Â§Ã‚ÂÃƒÂ Ã‚Â¦Ã‚Â¤ÃƒÂ Ã‚Â¦Ã‚Â¾, ÃƒÂ Ã‚Â¦Ã‚Â®ÃƒÂ Ã‚Â§Ã‚ÂÃƒÂ Ã‚Â¦Ã‚Â¦ÃƒÂ Ã‚Â¦Ã‚Â¿ ÃƒÂ Ã‚Â¦Ã‚Â¦ÃƒÂ Ã‚Â§Ã¢â‚¬Â¹ÃƒÂ Ã‚Â¦Ã¢â‚¬Â¢ÃƒÂ Ã‚Â¦Ã‚Â¾ÃƒÂ Ã‚Â¦Ã‚Â¨ ÃƒÂ Ã‚Â¦Ã‚Â¬ÃƒÂ Ã‚Â¦Ã¢â‚¬Â¢ÃƒÂ Ã‚Â§Ã¢â‚¬Â¡ÃƒÂ Ã‚Â¦Ã‚Â¯ÃƒÂ Ã‚Â¦Ã‚Â¼ÃƒÂ Ã‚Â¦Ã‚Â¾ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦) with a **Daily Total** column while entering |
| 10 Restaurant | **566 rows / 24 bills (ÃƒÂ¢Ã¢â‚¬Â°Ã‹â€ 24 items/bill)** | Meal register: Lunch/Dinner line items, PAX in guest column, charge-to-room (room "3"), Partial/Paid |
| 2 Advances | 21 rows | Cash accountability: WHO received each advance (Rikan/Joshim/Efti) + running total |
| 3 Collections | 3 rows (live) | Due collections at checkout |
| 6 Rooms | 10 rooms | **Capacity per room (2 vs 4)**, rates, OOS status |
| 9 Settings | ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â | Invoice prefix SER, booking prefix BK, check-in 12PM/out 10AM, **Financial year 01-Jul ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 30-Jun** |
| 12 Metrics | ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â | Manually computed P&L: resort rev ÃƒÂ¢Ã‹â€ Ã¢â‚¬â„¢ discount + F&B ÃƒÂ¢Ã‹â€ Ã¢â‚¬â„¢ expenses = net ÃƒÂ Ã‚Â§Ã‚Â³699,971 |

**The manager's back office is five living documents.** Three of them
(balance grid, occupancy grid, revenue grid) are hand-maintained *derivations*
of the bookings sheet ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â 900+ rows of manual duplication that drifts. The
software's core job: make those three grids **computed, always correct**, and
keep the two ledgers (expenses, F&B) fast for daily entry.

Verified: both grids are pure functions of bookings (tab 11 = rent ÃƒÂ¢Ã‹â€ Ã¢â‚¬â„¢ discount
per night; tab 7 = same, per guest, with OOS placeholders). Zero ambiguity.

## 2. Personas (from the data, not invented)

| Persona | Evidence | Device | Jobs |
|---|---|---|---|
| **Manager** (owns the sheet) | maintains all 5 docs, enters bookings, computes P&L | Desktop at desk | Day Sheet, bookings, approvals, expenses, P&L |
| **Front desk** | collections tab, advances received | Phone at counter | Check-in/out, collect cash, F&B ticket, see today's arrivals |
| **Agent** (Rikan) | 21 advances received by "Rikan", most agent bookings | WhatsApp today | Check availability, create booking, see own dues/commission |
| **Guest** | mobile numbers, bKash-era payments | Phone | Book, pay, see trip |

## 3. UX decisions (and why)

1. **Primary screen = Day Sheet** (not KPI cards).
   One date-navigable screen = tabs 7+8+11 merged: per room ÃƒÆ’Ã¢â‚¬â€ selected day ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â
   guest, due, revenue, BOOKED/AVAILABLE, OOS ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â with a day strip (balance due,
   revenue, expenses). This IS their current workflow; adoption means meeting
   it, then making it trusted. Drill into any cell ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ booking ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ actions.
2. **Bangla-first bilingual UI (bn default, en toggle).**
   Guest names, 48 expense categories, remarks are Bangla. Staff think in
   Bangla. English-only labels would corrupt data entry quality.
3. **Front desk = 3-tap phone flows.**
   Arrivals today ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ check-in ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ collect (advance/rent) ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ F&B add. Advance
   collection shows the **collector's name** prominently (tab 2 is an
   accountability register, not just a ledger).
4. **F&B = running ticket POS, not a form.**
   One bill ÃƒÂ¢Ã¢â‚¬Â°Ã‹â€  24 line items in the sheet. Room-first ("who's in-house"), quick
   items, and **charge-to-room increments the room booking's due** so the Day
   Sheet reflects it (currently wrongly separate).
5. **Expenses = daily cashbook register.**
   Date-first entry, live day-total while typing (the sheet's "Daily Total
   Expense" column), category autocomplete from history (48 Bangla categories).
6. **All money reports anchor to the Financial Year (1 Jul ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 30 Jun)** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â FY
   selector, not calendar years.
7. **Tour groups are first-class**: one flow ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ N room bookings under one group
   name (the "Kaktaruya Tour" pattern: 7 rooms, one guest).
8. **Walk-ins need minimal friction**: guest "local", no NID, no phone ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â the
   sheet's most common booking. Don't force identity fields.
9. **Migration must reconcile, not just import**: after import, computed
   balance/occupancy/revenue grids are diffed against the sheet's hand-made
   grids and drift is shown for manager review. Trust is the product.

## 4. Domain corrections from the deep read

- `rooms.capacity` per room (2/4) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â surfaced in availability & booking
- F&B: PAX count field; items are preset meals (Lunch/Dinner) + free text;
  bill rows are the unit of entry, bill = container
- F&B charge-to-room ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ posts to the room booking's ledger (one due, one truth)
- Revenue = rent ÃƒÂ¢Ã‹â€ Ã¢â‚¬â„¢ discount attributed per NIGHT of stay (checkout-day
  attribution), not booking-date
- Financial year on all P&L aggregates
- Expense category autocomplete seeded from the resort's own history

## 5. Build order (rebuild phase R1ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢R5)

| R | Scope | Exit criteria |
|---|---|---|
| **R1** ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ | **Day Sheet** (computed 3-in-1 grid + day strip + cell drill-down), bn/en i18n scaffold, default landing | **Reconciled vs hand-made grids: 240 checks, 238 exact, 2 explained (cancelled), 0 unexplained ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Aug 15ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“26, resort 2** | Manager can run a day off the Day Sheet; grid values match sheet exactly for Aug 15ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“26 ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ |
| **R2** DONE | **F&B POS rebuild** (room tabs, presets, charge-to-room into booking ledger), expenses cashbook register (live day total, Bangla category autocomplete). Verified: F&B due visible on Day Sheet instantly (7900 -> 7500 after collection), delete blocked on room-charged bills, metrics split room vs F&B, reconcile re-run 238 exact + 2 explained after fixing a nights-multiplier regression. | A meal for room X appears in that booking due on the Day Sheet instantly - PASS |
| **R3** ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ | **Tour group booking + walk-in fast path**, advance collector report (tab 2 as a view) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â **DONE: POST /bookings/group creates N one-room bookings w/ shared guest + GRP-#### tag (verified: GRP-0001 x3, first-night dues rent-advance on Day Sheet, group filter, single guest row); walk-in = name-only ("local", no phone) via relaxed guest DTO; collectors report w/ per-staff totals; reconcile held 238+2 throughout** | 7-room group booked in one flow; collector totals per staff ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ (3-room proof) |
| **R4** ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ | **Migration v2**: expenses + F&B history import; grid reconciliation as a product feature (Import page ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ Reconcile tab). **Verified live: expenses 77 rows = ÃƒÂ Ã‚Â§Ã‚Â³216,354 exact, 0/11 daily-total mismatches; F&B 24/24 bills = ÃƒÂ Ã‚Â§Ã‚Â³151,300 exact (sheet Total column authoritative), 0 status mismatches; reconcile over 321 days = 6,330 checks matched + 1 cancelled-explained, 0 unexplained; P&L: net ÃƒÂ Ã‚Â§Ã‚Â³691,971 vs sheet ÃƒÂ Ã‚Â§Ã‚Â³699,971 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â the ÃƒÂ Ã‚Â§Ã‚Â³8,000 delta is exactly the cancelled BK-00005 the sheet kept** | Zero unexplained drift on Aug data; P&L matches tab 12 within classified adjustments ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ |
| **R5** ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ | **FY-anchored reports** (financial-year selector, JulÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“Jun, fiscal-years endpoint), **invoice v2 bilingual** (BN/EN print layout w/ stay terms), **hardening audit** (all 87 routes guarded, resort-scoped, auth rate-limited, P2002-safe counters) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â verified: FY 2026-27 computed correctly, staff smoke 13/13, units 34/34, reconcile 6330/6331 + 1 cancelled + 0 unexplained on fresh boot | P&L FY selectable; invoice prints bilingual ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ |
| **R6** DONE | **Web guest booking**: public /book discovery + resort detail + availability search + OTP checkout + /book/trips. Guest API discover/detail made public, availability + booking auth-gated. Verified: discover 3 resorts (no auth), book -> staff confirm -> guest sees CONFIRMED. | Guest books from web without mobile app - PASS |

Kept as-is: auth/OTP, tenancy, availability guard (booking_nights), payments
ledger, notifications, plans, import engine core, mobile staff/guest apps
(they consume the same API; mobile gets Day-Sheet-lite in R1 follow-up).

## 6. What was wrong with v1 (recorded so it stays fixed)

- Built from one tab; discovered the other 11 only when asked
- No persona work; KPI-card dashboard nobody asked for
- English-only UI for a Bangla-data business
- F&B and Expenses as generic CRUD, not the registers they actually are
- Three hand-maintained grids treated as "derivable reports" instead of THE
  product surface
- No reconciliation story between sheet and software (trust gap)