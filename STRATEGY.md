> **Start with [STATUS.md](STATUS.md)** — it says where the project stands, what is left, and how these documents relate.

# Resort Mela — business decisions

> **Superseded on priorities by [PLAN-v3.md](PLAN-v3.md).** This document set
> product direction from one tenant's workbook. Those are one resort's facts —
> useful input, but not a basis for platform priorities, and the ordering here
> (payments first) was wrong for that reason. The tenant-level observations
> below stand; the sequencing does not.

> Written 2026-09-09 after reading all 11 tabs of the client's live workbook
> (`Sky_Eco_Resort_`, owned by bonanjalihouseboat@gmail.com, last edited 8 Sep).
> Every number below is computed from that workbook, not estimated. Where a
> figure is uncertain the uncertainty is stated rather than smoothed over.
>
> Supersedes the priority order in [ROADMAP.md](ROADMAP.md). PLAN.md and
> PLAN-v2.md stand — this changes what we build next and what we charge, not
> the domain model.

## 1. What the data actually says

Sky Eco Resort, Sajek Valley. 10 rooms, 7 sellable (Jasmine, Magnolia and Rose
are out of service — Rose blocked 15-Aug-2026 → 15-Aug-2027). Trading window in
the book: 15 Aug – 22 Oct 2026.

| Measure | Value | How it was derived |
|---|---|---|
| Occupancy | **40.2%** | 222 booked of 552 sellable room-nights, trading window only |
| ADR (gross) | **৳6,887** | 155 sold room-nights |
| ADR (net of discount) | **৳5,897** | discounting runs at 14.4% of rent |
| RevPAR | **৳1,892** | per sellable room per day |
| Room revenue | ৳1,055,425 | daily revenue grid |
| Restaurant | ৳233,550 | 37 bills, 206 lines |
| Recorded expenses | ৳448,102 | 132 rows, 80 categories |

**The finding that matters:** of ৳587,125 billed for stays that had already
finished by 8 Sep, only ৳150,750 is recorded as collected. **৳436,375 — 74% of
completed billing — has no payment record against it.**

It is possible some of that cash was taken at checkout and never written down;
the Collections tab has three rows in two months. That is not a mitigation. If
the money arrived and nobody recorded it, the resort still cannot tell you who
holds it. Either reading is a software problem.

Two supporting facts point the same way:

- **78% of all recorded cash passes through one agent.** Rikan ৳112,450, Efti
  ৳18,800, Joshim ৳7,500. There is no settlement trail — nothing says how much
  of Rikan's ৳112,450 reached the resort.
- **The books stopped being kept.** Expenses: ৳376,864 in August, ৳71,238 in
  September, ৳0 in October. Restaurant: ৳219,350 → ৳14,200 → ৳0. The registers
  were abandoned within weeks of the period starting.

And the three hand-maintained grids no longer agree with each other. The same
"resort revenue" has four answers: bookings tab ৳922,075, revenue grid
৳1,055,425, our recomputation ৳914,075, management dashboard ৳636,775. Twenty-two
grid cells carry ~৳141,350 of revenue with no booking behind them.

## 2. The decisions

### D1 — The product's promise changes: from correct records to money you can see

Record-keeping is close to solved. Our computed Day Sheet reproduces the
client's hand-made revenue grid at **98.9% (2,038 of 2,060 cells exact)**. That
is a finished job, and it is not what is hurting them.

What is hurting them is that three quarters of completed billing has no payment
record and most of the cash moves through one person untracked. Everything
below follows from re-pointing the product at that.

### D2 — Build payments next. It was ranked "future"; it is now first.

ROADMAP had online payments at 🟠 #5 behind a mobile app release. That ordering
was wrong given the collection rate.

- **PSP: SSLCommerz.** One integration covers bKash, Nagad and cards. Direct
  bKash PGW only if volume later justifies separate merchant onboarding.
- We integrate a gateway; we never hold funds. No licensing exposure.
- `payment_intents` and a mock provider already exist — this is an adapter
  swap, not new architecture.

**Deprioritised to pay for it:** mobile app store release (guests already book
on the web since R6 — the app adds a listing, not a capability), OTA channel
sync, website embed themes.

### D3 — Ship cash accountability as a feature, not a report

An agent or front-desk staffer takes money → it is recorded against their name →
a running "cash due to resort" balance → a settlement that clears it. The
`Wallet` and `WalletTxn` models already exist and are unused for this.

The collectors report shows who took cash. It does not show who still owes it.
That gap is the whole point.

### D4 — Price per active room, not in flat tiers

STARTER at ৳2,500 covers up to 10 rooms. Our only real customer profile is a
10-room property, so nobody ever upgrades and there is no expansion revenue.

**New: ৳300 per active room per month, minimum ৳2,500.** Out-of-service rooms
are not billed.

Sky Eco pays ৳2,500 today on 7 active rooms — no change to them — and ৳3,000
when they reopen the other three. A 25-room property pays ৳7,500. Revenue now
grows with the customer instead of flat-lining.

Sanity check on affordability: ৳2,500 against roughly ৳450,000 of monthly room
revenue is **0.55%**. International PMS products charge $5–15 per room per
month; ৳300 is well under that. This is priced to be an easy yes, not to
capture value — the value capture comes later, from payments volume, and only
once it is earned.

### D5 — Take no payment fee at launch

The PSP already takes its cut. Adding our margin on day one makes a harder
pitch for money we have not yet earned. Revisit once we are past ~20 properties
and can show what the collection rate did.

### D6 — Stop selling to chains

CHAIN (10 resorts, ৳12,000) is aimed at a customer we have never met. The market
we can actually see is the single-property owner-operator. Keep multi-resort as
a capability for the one owner who needs it; retire it as a sold plan and stop
building for it.

### D7 — Expense entry must be the fastest screen we have, or the P&L claim goes

Expense recording collapsed to zero by October. A profit-and-loss statement
computed over abandoned data is worse than no statement, because it looks
authoritative. Either entry becomes fast enough to survive a busy week — one
screen, date defaulted, category autocompleted from their own 80 categories,
amount, done — or we stop presenting P&L as a headline feature.

### D8 — Put idle inventory on the dashboard as money

Three of ten rooms are out of service, one of them blocked for a full year. At
the net ADR of ৳5,897 and 40.2% occupancy, that idle inventory is roughly
**৳2.6M of foregone revenue a year**. One number, on the dashboard, in taka.

That is the most persuasive thing this product can say to an owner, and we can
compute it today from data we already hold.

### D9 — Sell the peak, stop discounting into it

Sajek's season runs roughly November to February; the 40.2% above is a monsoon
number. Discounting is already running at 14.4% of rent. Seasonal `RatePlan`
support is built and unused. Before the winter peak, rates should be going up,
not down — and the software should be making that obvious.

### D10 — Target customer, stated plainly

Owner-operators of single properties, 5–25 rooms, in the domestic destinations:
Sajek, Cox's Bazar, Sylhet, Bandarban. Cash-first, agent-mediated,
Facebook-marketed. Not chains, not international inventory, not OTA-first.

## 3. What this changes in the backlog

| Was | Now |
|---|---|
| Mobile app release (🟠 #8) | Deferred. Web booking covers it |
| Online payments (🟠 #5, "future") | **First** |
| Agent wallets (built, idle) | **Second** — becomes cash settlement |
| Idle-inventory cost on dashboard | **Third** — cheap, and it sells |
| Expense entry speed | **Fourth** — or D7's second branch applies |
| OTA sync, embed themes, chain features | Dropped for now |

## 4. What I am not certain about

- **n = 1.** Every number here comes from one resort. The collection problem is
  severe and specific; whether it generalises is untested. The next two
  customers should be asked for their books before we treat it as a market
  truth.
- **Uncollected vs unrecorded.** The ৳436,375 could be partly cash taken and
  never written down. Worth asking the manager directly — the answer changes
  whether D2 or D3 matters more, though not whether both are needed.
- **Market size.** I have no reliable count of addressable properties in
  Bangladesh and have not invented one. That number should come from a real
  source before it appears in any plan.
- **Seasonality.** Inferred from Sajek's known season, not from their data —
  the book only covers Aug–Oct.
