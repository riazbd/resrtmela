/**
 * The shapes the API actually returns.
 *
 * These lived in three places: the API's own service return types, a block of
 * interfaces in the web app's api.ts, and a hand-rolled copy in whichever page
 * needed one — 64 of them across the console, plus 9 more in an Expo app that
 * has since been deleted. Three copies of one contract is three chances to
 * drift, and the drift is silent: a renamed field type-checks on both sides
 * and breaks only in the browser.
 *
 * One definition, imported by everyone. Where the API and this file could
 * still disagree, the API imports from here too (see common/page.ts).
 */
import type { DnsRecord } from "./domain";
import type { SITE_TEMPLATES } from "./site";
import type { PeriodUnit, Phase } from "./plan-schedule";

// ───────────────────────────── paging ─────────────────────────────

export interface PageRequest {
  skip?: number;
  take?: number;
}

/**
 * Every paged list returns the true total alongside its rows.
 *
 * Lists used to stop at a hard `take:` and return a bare array, so a resort
 * with 431 guests saw 200 and was told nothing. A list that quietly stops at
 * its cap reports a number that is not true, which is worse than refusing to
 * answer.
 */
export interface Page<T> {
  rows: T[];
  total: number;
  skip: number;
  take: number;
  /** true when rows beyond this page exist */
  truncated: boolean;
}

// ───────────────────────────── identity ─────────────────────────────

export interface Resort {
  id: number;
  name: string;
  tenantId: number;
  status: string;
  currency?: string;
  locale?: string;
  /**
   * The resort's own day. It has been in the schema all along and the console
   * never received it, so every default date was UTC — which in Bangladesh
   * means tomorrow from 18:00, the shift the front desk actually works.
   */
  timezone?: string;
  /**
   * The account this resort belongs to. Only `demo` so far, and only so a
   * console opened on an account the platform made to test with says so.
   */
  tenant?: { demo: boolean } | null;
}

/**
 * What the API hands back when it has just decided who somebody is.
 *
 * One shape from three doors — login, resort signup and agency signup all
 * return `issueToken`, because an account that has just been opened is signed
 * in by the same act that opened it.
 *
 * `resortIds` is empty for the two roles whose work is not inside one resort:
 * the platform owner sells to resorts, an agency sells across them.
 */
export interface Session {
  accessToken: string;
  tokenType: string;
  user: { id: number; role: string; resortIds: number[] };
}

/**
 * Two questions with one answer, because a screen may be closed to somebody
 * for two different reasons: `permissions` is what the owner granted this
 * person, `features` is what the resort's — or the agency's — plan includes.
 */
export interface MyAccess {
  permissions: string[];
  features: string[];
}

export interface Me {
  id: number;
  name: string;
  phone: string;
  /**
   * `/auth/me` has always sent this; the type simply never said so, so the
   * console could not show a person the address their reset link goes to.
   * Optional because an account created before both were required may still
   * carry a placeholder, which `displayEmail` renders as "not set".
   */
  email?: string | null;
  role: string;
  /**
   * The account this person signs in for — set for an agency's people. Its
   * status is the agency's standing with the platform: pending until verified,
   * suspended when behind on its bill.
   */
  account?: {
    id: number;
    name: string;
    kind: string;
    status: string;
    suspendedReason: string | null;
    /** An agency the platform opened to try things with, rather than a customer. */
    demo?: boolean;
  } | null;
  resorts: { resort: Resort }[];
}

export interface PermRole {
  id: number;
  name: string;
  system: boolean;
  users: number;
  permissions: string[];
}

// ───────────────────────────── bookings ─────────────────────────────

export interface BookingRow {
  id: number;
  code: string;
  groupTag?: string | null;
  state: string;
  paymentState: string;
  /**
   * Where the booking came from, or null when nobody said.
   *
   * This claimed to be a `string` long after the column became nullable, so
   * every screen was free to hand it straight to something that would call
   * `.replace` on it — and one of them did, which is how opening a booking
   * made through the form crashed the whole page. An unrecorded source is a
   * real and common state (the booking form does not ask), so it is in the
   * type now and the compiler can hold the screens to it.
   */
  source: string | null;
  checkIn: string | null;
  checkOut: string | null;
  guest: { id: number; fullName: string; phone: string };
  agent: string | null;
  rooms: (string | null)[];
  adults: number;
  children: number;
  discount: number;
  nights: number;
  /** The rooms and extra persons, before discount and before tax. */
  rent: number;
  paid: number;
  due: number;

  /**
   * The rest of what `computeTotals` sends, which this type did not say
   * it sent until 2026-09-20.
   *
   * The list route spreads `BookingsService.computeTotals(b, taxRules)`
   * into every row, so all of this has always been on the wire — and the
   * type stopped at `due`, so a screen wanting the invoice total had to
   * cast or do without. `BookingDetail` was wrong in exactly this way
   * about `rooms` and it cost a crash; here it cost a column.
   *
   * Optional rather than required because the agent projection of a
   * booking omits money the resort has chosen not to show.
   */
  roomRent?: number;
  taxable?: number;
  /** The single rate when there is exactly one, for a screen showing "+15%". */
  taxRatePct?: number;
  tax?: number;
  taxLines?: { code: string; label: string; ratePct: number; amount: number }[];
  /** taxable + tax: what the invoice comes to. */
  total?: number;
  refunded?: number;
}

/** One printable line of a quoted bill: what it is, and what it comes to. */
export interface QuoteLine {
  kind: "ROOM" | "EXTRA_PERSON";
  label: string;
  unitPrice: number;
  qty: number;
  nights: number;
  /** how many extra people this line is for; absent on a room line */
  persons?: number;
  amount: number;
}

/**
 * What a stay will cost, answered before anything is created.
 *
 * The booking form cannot work this out on its own: the nightly rate may be
 * seasonal, an untouched discount box still picks up the resort's standing
 * offers, and the tax rules never reach the browser. So the server prices it
 * with the same code that will charge it.
 */
export interface BookingQuote {
  nights: number;
  rent: number;
  roomRent: number;
  discount: number;
  /** true when the discount came from a standing offer rather than the clerk */
  discountIsAutomatic: boolean;
  taxable: number;
  taxRatePct: number;
  tax: number;
  taxLines: { code: string; label: string; ratePct: number; amount: number }[];
  total: number;
  lines: QuoteLine[];
}

/**
 * One booking, in full.
 *
 * **Not** `extends BookingRow`, and the difference is one field that cost a
 * crash. The list route sends `rooms: string[]`; the detail route never has,
 * and the type said it did until 2026-09-20 — the phone's detail screen
 * trusted it, called `b.rooms.filter(...)` and died on the first real
 * booking. The rooms are in `items`, and `roomNames()` reads them out.
 *
 * The tax fields below were the other half of the same mistake: the route
 * has always sent them and none of them were written down, so a screen
 * wanting to show the breakdown had to cast.
 */
export interface BookingDetail extends Omit<BookingRow, "rooms"> {
  resortId: number;
  cancelState: string;
  /** The rent before discount and before tax — what the rooms alone come to. */
  roomRent: number;
  taxable: number;
  taxRatePct: number;
  tax: number;
  taxLines: { code: string; label: string; ratePct: number; amount: number }[];
  /** present only for the agent who owns this booking, and only when the resort shows rates */
  agentPricing?: AgentPricing | null;
  invoiceNo?: string;
  remarks: string | null;
  /** the invoice total: after discount, with tax */
  total: number;
  refunded: number;
  extraPersons: number;
  /** FLAT | PERCENT — how the discount was given; `discount` is what it came to */
  discountKind: string;
  /** what was typed: an amount, or a percentage of the stay */
  discountValue: number;
  createdBy: { id: number; name: string } | null;
  guest: { id: number; fullName: string; phone: string; nidPassportNo: string | null };
  items: {
    id: number;
    kind: string;
    room: { id: number; name: string; type: string } | null;
    slot: { id: number; name?: string; startsAt: string; endsAt: string } | null;
    qty: number;
    unitPrice: number | null;
    nights: number;
    /** CHARGE lines: SERVICE | DAMAGE | FINE, and what it was for */
    chargeKind: string | null;
    label: string | null;
  }[];
  payments: {
    id: number;
    amount: number;
    /** null when nobody recorded how it arrived — an import with no method column */
    method: string | null;
    type: string;
    receivedBy: string | null;
    receivedAt: string;
    note: string | null;
  }[];
}

/**
 * What making a tour group answers with.
 *
 * One booking per room, so the answer is a tag to find them all by and the
 * codes to read out — not the bookings themselves. The client promised
 * `BookingDetail[]` here until 2026-09-20; the route has only ever sent an id
 * and a code.
 */
export interface GroupBookingResult {
  groupTag: string;
  count: number;
  bookings: { id: number; code: string }[];
}

/**
 * One payment, as the desk recorded it.
 *
 * `method` is nullable because the importer had nothing to write for sheets
 * with no method column, and a defaulted "CASH" was indistinguishable from
 * cash somebody counted.
 */
export interface PaymentRow {
  id: number;
  bookingId: number;
  amount: number;
  method: string | null;
  paymentType: string;
  receivedById: number | null;
  receivedAt: string;
  note: string | null;
  clientRef: string | null;
}

/**
 * What taking a payment answers with.
 *
 * Not the booking alone: `replayed` is how a client that queues writes knows
 * the server recognised this one as a repeat of a write it already applied.
 * Without it, an offline desk that reconnects twice cannot tell a second
 * receipt from the first one coming back.
 */
export interface PaymentReceipt {
  payment: PaymentRow;
  booking: BookingDetail;
  replayed: boolean;
}

/**
 * One stay on today's board.
 *
 * Deliberately not a `BookingRow`: the dashboard asks about one day, so the
 * rows carry whether they are arriving or departing rather than repeating the
 * dates, and the guest comes without an id because nothing on that screen
 * opens a guest.
 */
export interface TodayRow {
  id: number;
  code: string;
  arriving: boolean;
  departing: boolean;
  guest: { fullName: string; phone: string } | null;
  agent: string | null;
  rooms: (string | null | undefined)[];
  state: string;
  nights: number;
  rent: number;
  paid: number;
  due: number;
}

/**
 * The dashboard's whole read: who is coming, who is going, and what the
 * desk should be collecting today.
 *
 * The last two were `duesTotal`/`duesCount` until 2026-09-21, which
 * reads as the resort's ledger and is not what they hold: they count
 * only the bookings arriving today, so the phone showed "Outstanding
 * dues ৳0" to a resort owed one and a half lakh. Named for their scope
 * now, so the next screen to reach for them reaches with its eyes
 * open. The ledger itself is `/payments`.
 */
export interface TodayFeed {
  arrivals: TodayRow[];
  departures: TodayRow[];
  occupancyPct: number;
  arrivalsDueTotal: number;
  arrivalsDueCount: number;
}

export interface CalendarBooking {
  id: number;
  code: string;
  state: string;
  paymentState: string;
  guestName: string;
  agentName: string | null;
  checkIn: string;
  checkOut: string;
  rooms: { id: number | null; name: string }[];
}

// ───────────────────────────── inventory ─────────────────────────────

export interface RoomType {
  id: number;
  name: string;
  maxAdults: number;
  maxChildren: number;
  extraPersonAllowed?: boolean;
  extraPersonRate?: string | number;
  amenities?: string[];
  active: boolean;
}

export interface Room {
  id: number;
  resortId: number;
  roomTypeId: number;
  name: string;
  baseRate: string | number;
  status: "ACTIVE" | "OUT_OF_SERVICE";
  /** DIRTY, CLEANING or CLEAN — the inventory list is about today, so it shows it. */
  housekeeping?: string;
  housekeepingAt?: string | null;
  /**
   * What THIS room takes. Seeded from its type when the room is created and
   * the room's own answer after that, because rooms of one type are not one
   * size — which is why this moved off the type.
   */
  extraPersonAllowed?: boolean;
  extraPersonRate?: string | number;
  extraPersonMax?: number;
  roomType?: RoomType;
}

export interface RatePlan {
  id: number;
  roomTypeId: number;
  dateFrom: string;
  dateTo: string;
  price: string | number;
  active: boolean;
  roomType?: { id: number; name: string };
}

export interface RoomAvail {
  roomId: number;
  roomName: string;
  roomTypeId: number;
  baseRate: number;
  /** what this agent would owe the resort per night; absent for resort staff */
  agentRate?: number;
  status: string;
  busyNights: string[];
  /**
   * Where the room stands with housekeeping *now*. Only meaningful when
   * the guest arrives today — `roomOffer` is where that is decided, and
   * it ignores this for any other date.
   */
  housekeeping?: string;
  /**
   * What this room takes, so the booking form can offer the box for the rooms
   * that have a bed and price it at the room's own rate. It used to ask the
   * room *type*, which one type covering nine rooms of different sizes could
   * not answer.
   */
  extraPersonAllowed?: boolean;
  extraPersonRate?: number;
  extraPersonMax?: number;
}

/**
 * The two numbers an agent needs while quoting a guest: what the guest pays,
 * and what the agent will owe the resort once commission is taken off.
 */
export interface AgentPricing {
  actual: number;
  commissionKind: "PERCENT" | "FLAT";
  commissionRate: number;
  commission: number;
  agentPrice: number;
}

// ───────────────────────────── guests ─────────────────────────────

export interface GuestRow {
  id: number;
  fullName: string;
  phone: string;
  nidPassportNo: string | null;
  bookingCount: number;
  lastStay: { code: string; checkIn: string | null; checkOut: string | null; state: string } | null;
}

// ───────────────────────────── the front desk ─────────────────────────────

export interface DaySheetCell {
  mode: "oos" | "available" | "booked";
  bookingId?: number;
  code?: string;
  state?: string;
  guestName?: string;
  due?: number | null;
  revenue?: number | null;
  arrives?: boolean;
  departs?: boolean;
}

export interface DaySheetRoom {
  roomId: number;
  name: string;
  capacity: number | null;
  status: string;
  /**
   * Where housekeeping stands with the room *now* — which is only about
   * today's register, and the screens ignore it on any other date.
   */
  housekeeping?: string;
  cell: DaySheetCell;
}

export interface DaySheet {
  date: string;
  rooms: DaySheetRoom[];
  strip: {
    balanceDue: number;
    revenue: number;
    expenses: number;
    arrivals: number;
    departures: number;
    occupancy: number;
    totalRooms: number;
  };
}

/**
 * Outstanding money. Not a Page: `total` here is the money owed, not a row
 * count, so it deliberately does not share the list envelope.
 */
export interface DuesReport {
  total: number;
  count: number;
  /**
   * The same money, split by who is on the hook for it. A guest's balance is
   * collected at the desk; an agency's is settled between two businesses. One
   * total covering both was a number nobody could act on.
   */
  guestTotal: number;
  guestCount: number;
  agencyTotal: number;
  agencyCount: number;
  /** What each agency owes across all its short bookings — one row per phone call. */
  byAgency: { accountId: number | null; agency: string; bookings: number; due: number }[];
  rows: {
    id: number;
    code: string;
    state: string;
    guest: { fullName: string; phone: string };
    /** who sold it, or null for a booking the resort took itself */
    agent: { id: number; name: string; accountId: number | null; agency: string } | null;
    checkIn: string | null;
    checkOut: string | null;
    rooms: number;
    nights: number;
    rent: number;
    discount: number;
    tax: number;
    total: number;
    paid: number;
    due: number;
  }[];
}

// ───────────────────────────── money & people ─────────────────────────────

export interface Employee {
  id: number;
  name: string;
  phone: string | null;
  designation: string | null;
  salary: number;
  joinDate: string | null;
  active: boolean;
  payments: { id: number; month: string; amount: number; method: string | null }[];
}

/** One payment against a month — an advance, or the settlement. */
export interface PayrollPaymentRow {
  id: number;
  kind: string;
  amount: number;
  method: string | null;
  note: string | null;
  paidAt: string;
}

/**
 * A month of payroll.
 *
 * `paid` was a boolean and `amount` was the single payment, because a month
 * held exactly one. It holds as many as it took now — a cook on 15,000 takes
 * 2,000 on the 8th and 5,000 on the 20th — so the question the sheet answers
 * stopped being "paid?" and became "how much of this is still owed".
 */
export interface PayrollSheet {
  month: string;
  rows: {
    employeeId: number;
    name: string;
    designation: string | null;
    salary: number;
    /** everything handed over for this month, advances included */
    paid: number;
    /** how much of `paid` was taken early */
    advance: number;
    /** salary − paid, floored at zero */
    remaining: number;
    /** the salary has been handed over in full, however many payments it took */
    settled: boolean;
    payments: PayrollPaymentRow[];
  }[];
  totals: {
    expected: number;
    paid: number;
    advance: number;
    remaining: number;
    headcount: number;
    settledCount: number;
  };
}

export interface FoodPackage {
  id: number;
  name: string;
  price: number;
  items: string | null;
  active: boolean;
}

/**
 * The headline figures for a period, from `GET /resorts/:id/metrics`.
 *
 * Typed `unknown` on the client until 2026-09-20, so the console kept a
 * local `interface Metrics` and cast to it — which is the arrangement
 * where the server changes a field and nobody finds out. Written here
 * from `reports.service.ts`'s own return.
 *
 * The three that are easy to misread carry their own note. `billed` is
 * not income, `stillDue` is never profit, and `taxCollected` is money
 * held for the government rather than earned.
 */
/**
 * A resort's own settings, from `GET /resorts/:id`.
 *
 * Typed `unknown` until 2026-09-20, which phase 1's plan named as a debt
 * and left to the settings slice: its bookings page read this route twice
 * through a hand-written `api<...>` because there was nothing to read it
 * with.
 *
 * **An agent gets a different object from this route** — the shop window,
 * not the settings — so every field an agent never sees is optional here.
 * `requireSellingAccess` lets an agency in and the projection behind it
 * narrows what they get; a type that promised `binNumber` to an agent
 * would be lying about the half of the route it never sees.
 */
/**
 * Somebody who works at a resort, from `GET /resorts/:id/users`.
 *
 * Typed `unknown[]` until 2026-09-20. The row is the *user* flattened
 * with the link that says they work here, which is why `roleId` and
 * `roleName` sit beside the person's own fields rather than under a
 * `role` object.
 *
 * There is deliberately no wallet on it: that is an agency's account
 * with the platform, and a resort reading it would be reading the
 * agency's trade with everybody else.
 */
export interface ResortUser {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  /** The platform-wide role — RESORT_ADMIN, FRONT_DESK, AGENT and so on. */
  role: string;
  status: string;
  createdAt: string;
  /** The resort's own role, which is what the permission matrix reads. */
  roleId: number | null;
  roleName: string | null;
}

export interface ResortSettings {
  id: number;
  name: string;
  slug?: string;
  location: string | null;
  timezone: string;
  currency: string;
  locale: string;
  checkInTime: string;
  checkOutTime: string;
  showRatesToAgents: boolean;
  /** Everything from here down is the staff projection only. */
  address?: string | null;
  website?: string | null;
  contactPhone?: string | null;
  /** The fallback when a resort has defined no tax rules; see `TaxRuleRow`. */
  taxRatePct?: string | number;
  /** Business Identification Number — a VAT invoice in Bangladesh must show it. */
  binNumber?: string | null;
  /** Agent bookings must be fully paid this many hours before check-in. */
  agentPaymentHours?: number;
  /** How many days ahead an agency may book. Null is no limit. */
  agentBookingWindowDays?: number | null;
  agentCommissionKind?: string;
  agentCommissionRate?: string | number;
  invoicePrefix?: string;
  bookingPrefix?: string;
  fbPrefix?: string;
  /** Financial year start, `MM-DD`. */
  fyStartMonthDay?: string;
  status?: string;
  suspendedReason?: string | null;
  roomTypes?: RoomType[];
  rooms?: Room[];
  _count?: { bookings: number; guests: number };
}

export interface ResortMetrics {
  /** the stays' rent before discount */
  resortRevenue: number;
  discount: number;
  /** billed for the period's stays, after discount — not income */
  netRoomRevenue: number;
  /** restaurant sales, net of tax */
  restaurantRevenue: number;
  /** received in the period, net of refunds and of the tax inside it */
  grossIncome: number;
  /** what the period's stays and bills have not paid yet — shown, never profit */
  stillDue: number;
  /** the tax inside what was received, collected for the government */
  taxCollected: number;
  expenses: number;
  netProfit: number;
  bookings: number;
}

export interface PLReport {
  from: string;
  to: string;
  resort: {
    roomRevenue: number;
    extraPersonRevenue: number;
    otherRevenue: number;
    /** services, damage and fines added to stays */
    chargesRevenue: number;
    discounts: number;
    /** what the period's stays are worth after discount — not income */
    billed: number;
    /** money received in the period, net of refunds and tax: what profit is made of */
    income: number;
    /** the tax inside what was received, collected for the government */
    taxCollected: number;
    /** what the period's stays have not paid yet */
    stillDue: number;
    expenses: number;
    payroll: number;
    net: number;
    expenseCategories: { category: string; amount: number }[];
  };
  restaurant: {
    /** sales billed in the period, net of tax */
    revenue: number;
    income: number;
    taxCollected: number;
    stillDue: number;
    expenses: number;
    net: number;
    expenseCategories: { category: string; amount: number }[];
  };
  combined: { billed: number; income: number; stillDue: number; expenses: number; net: number };
}

// ───────────────────────── writing to guests ─────────────────────────

/**
 * What is left to send with, and where to pay for more.
 *
 * Credits are bought by asking: `POST /email-credits/purchase` queues an
 * order and grants nothing until the platform approves it, which is why
 * `payTo` travels with the balance — the instructions are the platform's
 * and change without a deploy.
 */
export interface EmailCredits {
  credits: number;
  payTo: string;
}

/** A campaign that has already gone out. `id` is a string: it is a bigint. */
export interface EmailCampaign {
  id: string;
  subject: string;
  body: string;
  recipients: number;
  /** SENT, FAILED or PARTIAL — a send that reached some of the list. */
  status: string;
  sentAt: string;
  resortId: number | null;
}

// ───────────────────────── the restaurant ─────────────────────────

export interface FbBillItem {
  name: string;
  qty: number;
  unitPrice: number;
  /** `unitPrice × qty`, rounded by the server. */
  total: number;
}

/**
 * One restaurant bill, from `GET /resorts/:id/fb/bills`.
 *
 * The totals are the server's. `fbBillTotals` is one arithmetic in one
 * place because it used to be written out by hand here four times and in
 * five other files, with inconsistent rounding and no tax anywhere — so
 * a resort charging VAT charged it on the room and not on the food.
 */
export interface FbBill {
  id: number;
  code: string;
  billDate: string;
  guestName: string | null;
  roomId: number | null;
  bookingId: number | null;
  method: string | null;
  note: string | null;
  items: FbBillItem[];
  /** Before tax. */
  net: number;
  tax: number;
  taxLines: { code: string; label: string; ratePct: number; amount: number }[];
  total: number;
  paid: number;
  due: number;
  status: string;
}

/** A stay that can have food put on its room, for the POS room picker. */
export interface FbInHouse {
  bookingId: number;
  code: string;
  guestName: string;
  /** A room deleted after the booking was taken comes back null. */
  rooms: (string | null)[];
}

// ───────────────────────── activities ─────────────────────────

export interface ActivitySchedule {
  /** Absent on one being proposed; present on one the server holds. */
  id?: number;
  /** 0 is Sunday, as `Date.getUTCDay()` counts. */
  weekday: number;
  startTime: string;
  endTime: string;
  capacity: number;
  active?: boolean;
}

export interface Activity {
  id: number;
  name: string;
  /** A code from the resort's own `ACTIVITY_CATEGORY` list. */
  category: string;
  basePrice: number;
  durationMin: number;
  minPerSlot: number;
  maxPerSlot: number;
  description: string | null;
  active: boolean;
  schedules: ActivitySchedule[];
  /** Slots from now on, which is what says whether it is really running. */
  upcomingSlots: number;
  nextSlot: string | null;
}

export interface ActivitySlot {
  id: number;
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookedCount: number;
  remaining: number;
}

export interface ExpenseRow {
  id: number;
  date: string;
  category: string;
  details: string | null;
  scope: string;
  amount: number;
}

export interface ExpensePage extends Page<ExpenseRow> {
  summary: { amount: number; byCategory: { category: string; amount: number }[] };
}

// ───────────────────────────── the platform ─────────────────────────────

export interface CmsRow {
  key: string;
  value: string;
  updatedAt: string;
}

/** Commercial terms the super admin owns; see PlatformSettingsService. */
export type PlatformSettings = Record<string, string>;

export interface BillingSweepResult {
  trialsEnded: number;
  duesRaised: number;
  duesOverdue: number;
  suspended: number;
  resumed: number;
  notices: number;
}

export interface ExportDataset {
  name: string;
  headers: string[];
  rows: (string | number | boolean | null)[][];
}

export interface ExportArchive {
  resort: { id: number; name: string; timezone: string; currency: string };
  exportedAt: string;
  datasets: Record<string, ExportDataset>;
  counts: Record<string, number>;
}

// ───────────────────────── the agency's own side ─────────────────────────

/** One node of the agency's tour tree: Transport → Bus → AC, any depth. */
export interface TourCategoryNode {
  id: number;
  name: string;
  active: boolean;
  children: TourCategoryNode[];
}

export interface TourPackageLine {
  id: number;
  categoryId: number | null;
  category: string | null;
  label: string;
  qty: number;
  /** what the agency pays — its own business, never on a client's copy */
  unitCost: number;
  unitPrice: number;
}

export interface TourPackageTotals {
  cost: number;
  price: number;
  margin: number;
}

export interface TourPackageRow {
  id: number;
  name: string;
  summary: string | null;
  days: number;
  nights: number;
  pax: number;
  active: boolean;
  lines: number;
  totals: TourPackageTotals;
}

export interface TourPackageDetail extends Omit<TourPackageRow, "lines"> {
  items: TourPackageLine[];
}

export interface ExpenseHeadRow {
  id: number;
  name: string;
  active: boolean;
  entries: number;
  amount: number;
}

export interface AgencyExpenseRow {
  id: number;
  date: string;
  headId: number | null;
  head: string;
  details: string | null;
  amount: number;
}

export interface AgencyExpensePage extends Page<AgencyExpenseRow> {
  summary: { amount: number; byHead: { headId: number | null; head: string; amount: number }[] };
}

export interface AgencyEmployee {
  id: number;
  name: string;
  phone: string | null;
  designation: string | null;
  salary: number;
  joinDate: string | null;
  active: boolean;
  recent: { month: string; amount: number }[];
}

export type SalesDocKind = "QUOTATION" | "INVOICE";
export type SalesDocStatus =
  | "DRAFT"
  | "SENT"
  | "ACCEPTED"
  | "DECLINED"
  | "EXPIRED"
  | "PAID"
  | "VOID";

export interface SalesDocTotals {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  due: number;
}

export interface SalesDocRow {
  id: number;
  kind: SalesDocKind;
  number: string;
  status: SalesDocStatus;
  clientName: string;
  issueDate: string;
  validUntil: string | null;
  sentAt: string | null;
  totals: SalesDocTotals;
}

export interface SalesDocLine {
  id: number;
  label: string;
  details: string | null;
  qty: number;
  unitPrice: number;
  amount: number;
}

export interface SalesDocDetail extends SalesDocRow {
  clientEmail: string | null;
  clientPhone: string | null;
  clientAddress: string | null;
  guestId: number | null;
  packageId: number | null;
  currency: string;
  taxRate: number;
  notes: string | null;
  terms: string | null;
  paidAt: string | null;
  items: SalesDocLine[];
  convertedFrom: { id: number; number: string } | null;
  convertedTo: { id: number; number: string } | null;
}

/** Everyone this agency has served, counted across its whole team. */
export interface AgencyGuestRow {
  id: number;
  fullName: string;
  phone: string;
  email: string | null;
  bookings: number;
  nights: number;
  spend: number;
  lastStay: string | null;
  resorts: string[];
}

/**
 * One room, occupied for a span of nights, as an agency is allowed to see it.
 *
 * `guestName` and `code` are null for a stay the agency did not sell, and there
 * is no setting that lifts that. It is the whole point of the type: an agency
 * needs to know a night is gone without learning whose customer is in the room.
 */
export interface AgencyStay {
  roomId: number;
  checkIn: string;
  checkOut: string;
  mine: boolean;
  state: string;
  guestName: string | null;
  code: string | null;
  /** the stay to open, and what is still owed — the agency's own bookings only */
  bookingId: number | null;
  paymentState: string | null;
}

/** One resort's month: the rooms it has, and the nights already taken. */
export interface AgencyResortMonth {
  resort: { id: number; name: string; location: string | null };
  /** the last check-out (YYYY-MM-DD) agencies may book here; null is no limit */
  bookableUntil: string | null;
  rooms: {
    id: number;
    name: string;
    roomTypeId: number | null;
    roomTypeName: string | null;
    /** ACTIVE, or OUT_OF_SERVICE — drawn as a room that cannot be sold */
    status: string;
    /** null where the resort hides its pricing from agencies */
    baseRate: number | null;
  }[];
  stays: AgencyStay[];
}

export interface AgencyCalendar {
  from: string;
  to: string;
  resorts: AgencyResortMonth[];
}

/** What is free between two dates, at one of the resorts the agency sells. */
export interface AgencyRoomOffer {
  resort: { id: number; name: string; location: string | null };
  rooms: {
    roomId: number;
    roomName: string;
    roomTypeId: number;
    baseRate: number;
    /** what the agency would owe the resort; absent when the resort hides rates */
    agentRate?: number;
  }[];
}

/**
 * One value on a list a resort owns: how it takes money, where a booking came
 * from, what kind of thing an activity is. These were Prisma enums, which made
 * each set a fact about the software rather than about the business.
 */
export interface ResortOption {
  id: number;
  resortId: number;
  list: string;
  code: string;
  label: string;
  sortOrder: number;
  active: boolean;
  meta?: Record<string, unknown> | null;
}

/**
 * One charge a resort adds to a bill. `Resort.taxRatePct` was a single
 * percentage, which could not describe 15% VAT plus a 10% service charge that
 * VAT is then charged on, nor a restaurant taxed at its own rate, nor a menu
 * price quoted with the tax already inside it.
 */
export interface TaxRuleRow {
  id: number;
  resortId: number;
  code: string;
  label: string;
  ratePct: number | string;
  appliesTo: string;
  inclusive: boolean;
  compound: boolean;
  sortOrder: number;
  active: boolean;
}

/** One tax as an invoice prints it. */
export interface TaxLineRow {
  code: string;
  label: string;
  ratePct: number;
  amount: number;
}

/**
 * An agency's wallet, and how its balance got there.
 *
 * There is no payment gateway behind this. An agency hands over cash or
 * sends bKash, and somebody at the platform credits the wallet — which
 * is why `by` and `method` exist at all: the agency could see the
 * balance move and not who moved it. Both are null on entries made
 * before they were recorded, so a screen shows what it has and does not
 * invent the rest.
 *
 * `id` is a string because the row is a `BigInt` and JSON has no such
 * thing. `amount` is signed: positive is money in.
 */
export const WALLET_KINDS = [
  "TOPUP",
  "COMMISSION",
  "BOOKING_HOLD",
  "PAYOUT",
  "REFUND",
  "ADJUST",
] as const;

export type WalletKind = (typeof WALLET_KINDS)[number];

export interface AgencyWalletTxn {
  id: string;
  kind: WalletKind;
  /** signed — positive is money into the wallet */
  amount: number;
  balanceAfter: number;
  note: string | null;
  bookingId: number | null;
  /** how the money came, for a top-up somebody took by hand */
  method: string | null;
  /** who at the platform moved it */
  by: string | null;
  createdAt: string;
}

export interface AgencyWallet {
  balance: number;
  active: boolean;
  /** the last hundred, newest first */
  txns: AgencyWalletTxn[];
}

/** One line of what an agency and its staff did. */
export interface AgencyActivity {
  id: string;
  actor: { id: number; name: string } | null;
  resort: { id: number; name: string } | null;
  action: string;
  entity: string;
  entityId: number | null;
  at: string;
}

/**
 * A category as the server hands it back after a write.
 *
 * Not a `TourCategoryNode`: the list route nests them and this one
 * cannot, because a row that was just created has no children and does
 * know its parent. Typing the reply as the tree node would have put a
 * `children` array on a screen that never receives one.
 */
export interface TourCategorySaved {
  id: number;
  name: string;
  parentId: number | null;
  active: boolean;
}

/**
 * What the server did when asked to remove something.
 *
 * It deletes what nothing uses and deactivates what something does — an
 * expense already booked against a head still has to name it. The reply
 * says which happened, and a screen that reports "deleted" for the other
 * one is telling the person their history is gone when it is not.
 */
export type Removal = { deleted: true } | { deactivated: true };

/** Somebody the agency owner added to their own account. */
export interface AgencyStaff {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  status: string;
  agentRoleId: number | null;
  createdAt: string;
}

/** A role the agency wrote, and how many people hold it. */
export interface AgencyRole {
  id: number;
  name: string;
  permissions: string[];
  staff: number;
}

/**
 * A key the agency's own website signs its requests with.
 *
 * `id` is a string for the same reason a wallet line's is. The secret is
 * shown once, at creation, and never again — which is why `prefix` is
 * here: it is the only part of the key this route will ever hand back,
 * and the only way to tell one row from another when revoking.
 */
export interface AgencyApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  active: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

/** One of the agency's resorts, as its own website lists them. */
export interface AgencySiteResort {
  id: number;
  slug: string;
  name: string;
  location: string | null;
}

/** A photograph on the agency's site. */
export interface AgencySitePhoto {
  id: number;
  url: string;
  alt: string | null;
  sortOrder: number;
}

/**
 * The agency's own website, as its editor sees it.
 *
 * The phone shows whether it is published and at what address, and
 * leaves the editing on the desk — an intro paragraph, a theme colour
 * and a photo order are not one-handed work.
 */
export interface AgencySite {
  slug: string;
  name: string;
  published: boolean;
  publishedAt: string | null;
  headline: string | null;
  intro: string | null;
  themeColor: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  address: string | null;
  facebook: string | null;
  instagram: string | null;
  hiddenResortIds: number[];
  resorts: AgencySiteResort[];
  photos: AgencySitePhoto[];
  /** how much of the agency's upload quota its photographs take */
  storage: { used: number; quota: number };
}

/**
 * A resort an agency may sell, on the discover screen.
 *
 * `access` is the whole point of the row. An agency the platform has not
 * verified sees every resort and can book none of them, and `reason` is
 * the platform's own words for why — so the screen says what is wrong
 * rather than showing a list that quietly does nothing when tapped.
 */
export interface DiscoverResort {
  id: number;
  name: string;
  location: string | null;
  roomCount: number;
  roomTypeCount: number;
  /** the cheapest active room's base rate, or null where a resort has none */
  priceFrom: number | null;
  access: "OPEN" | "WAITING";
  reason: string | null;
}

/**
 * A room on the housekeeping list.
 *
 * `departedToday` and `arrivingToday` are the two facts a client cannot
 * work out for itself, and they are what `housekeepingOrder` sorts on —
 * the room somebody left this morning with somebody arriving into it
 * tonight is the one to clean first.
 */
export interface HousekeepingRow {
  id: number;
  name: string;
  roomTypeName: string | null;
  /** ACTIVE, or OUT_OF_SERVICE — a room not for sale still gets cleaned */
  status: string;
  housekeeping: string;
  housekeepingAt: string | null;
  /** who last moved it; null when the departure did, not a person */
  housekeepingBy: string | null;
  departedToday: boolean;
  arrivingToday: boolean;
}

/**
 * A bill as the resort issues it (phase 4, task 2).
 *
 * `client.bookings.invoice` answered `unknown` until 2026-09-21 — one of
 * twenty-three routes that did — so the console cast it and the phone
 * could not show a guest their bill at all.
 *
 * Written from `invoicePayload` in the service, not from the console's
 * JSX. Phase 3 learned that the hard way: `AgencySite` was typed off a
 * screen and was missing two fields the server had always sent.
 *
 * **Two halves with different lifetimes.** Everything down to `items` is
 * the charge, and an invoice that was frozen replays exactly what it said
 * the day it was issued. The settlement below it is read fresh every
 * time, because what has been paid against a bill goes on moving after
 * the bill is printed. A screen that renders the frozen half and asks the
 * live half for the balance is showing the truth twice.
 */
export interface InvoicePayload {
  invoiceNo: string;
  issuedAt: string | null;
  resort: {
    id: number;
    name: string;
    location: string | null;
    address: string | null;
    phone: string | null;
    website: string | null;
    /** A VAT invoice in Bangladesh has to show the seller's BIN. */
    binNumber: string | null;
    checkInTime: string | null;
    checkOutTime: string | null;
    currency: string;
    locale: string;
  };
  booking: {
    code: string;
    state: string;
    checkIn: string | null;
    checkOut: string | null;
    nights: number;
    adults: number;
    children: number;
    remarks: string | null;
    agent: string | null;
  };
  guest: {
    fullName: string;
    phone: string | null;
    nidPassportNo: string | null;
    email: string | null;
  };
  items: {
    description: string;
    /** Only a room line is multiplied by the nights; everything else is null. */
    nights: number | null;
    qty: number;
    unitPrice: number;
    amount: number;
  }[];
  /**
   * What `computeTotals` sends, spread here as it is into a `BookingRow`.
   * Named rather than inherited: a `BookingRow` is a row in a list and an
   * invoice is a document, and one extending the other would say they are
   * the same thing.
   */
  nights: number;
  /**
   * What the stay came to before discount: rooms, extra persons, F&B
   * charged to the room, activities — everything on `items`.
   *
   * `roomRent` is the rooms alone. Both are sent and they are different
   * numbers; this type carried only the second until 2026-09-21, so the
   * public invoice page — which prints `rent` on its Rent line — was
   * reading a field the type said did not exist.
   */
  rent: number;
  roomRent: number;
  discount: number;
  taxable: number;
  /** the single rate when there is exactly one, for a line that says "+15%" */
  taxRatePct: number;
  tax: number;
  /** every tax charged, named and priced, in the order it was charged */
  taxLines: { code: string; label: string; ratePct: number; amount: number }[];
  /** taxable + tax: what the invoice comes to. */
  total: number;
  paid: number;
  refunded: number;
  due: number;

  /** Read fresh on every request — see the note above. */
  payments: {
    date: string;
    method: string;
    type: string;
    amount: number;
    receivedBy: string | null;
  }[];
  paymentState: string;
}

// ──────────────────── what the reports actually answer ────────────────────

/**
 * Six reports and the audit trail, typed from `reports.service.ts`.
 *
 * Every one of them answered `unknown` in the typed client until
 * 2026-09-21, so the console cast each to a locally hand-written
 * interface sitting a few lines above the call — the exact arrangement
 * this file exists to end. `CollectorRow.recentCodes` is the proof it
 * matters: the report renamed `codes` when its totals moved into the
 * database, nothing type-checked against the rename, and the Reports
 * page went to the error boundary on `undefined.slice()`.
 */
export interface DailyRevenueRow {
  date: string;
  roomRevenue: number;
  fbRevenue: number;
  /** what was spent that day, resort and restaurant together */
  expenses: number;
  net: number;
}

export interface AgentPerformanceRow {
  agentId: number;
  name: string;
  /** the resort's terms with this agency, never a per-person figure */
  commissionRate: number;
  commissionKind: string;
  bookings: number;
  rent: number;
  due: number;
  commission: number;
}

export interface AgentPerformanceReport {
  from: string | null;
  to: string | null;
  rows: AgentPerformanceRow[];
}

export interface SourceReportRow {
  /** the booking's source, or the word the server uses for one nobody recorded */
  source: string;
  bookings: number;
  rent: number;
  due: number;
}

export interface SourceReport {
  from: string | null;
  to: string | null;
  rows: SourceReportRow[];
}

/**
 * One collector's take.
 *
 * `userId` is null twice over, and the two are different claims:
 * `fromSheet` true means the owner wrote the name in a spreadsheet
 * column, false means nobody is credited at all.
 */
export interface CollectorRow {
  userId: number | null;
  name: string;
  count: number;
  total: number;
  fromSheet: boolean;
  /** a sample from the recent list, not every booking behind the total */
  recentCodes: string[];
}

export interface CollectorsReport {
  /** the period's whole take, so the cards never have to be added up by eye */
  total: number;
  /** `method` is null for receipts imported before the column existed */
  byMethod: { method: string | null; count: number; total: number }[];
  rows: CollectorRow[];
  recent: {
    id: number;
    at: string;
    amount: number;
    method: string | null;
    bookingCode: string;
    guest: string;
    /** a REFUND reads as money leaving; a line that does not say so looks like a collection */
    type: string;
    receivedBy: string | null;
    fromSheet: boolean;
  }[];
}

/** What the rooms nobody can sell are costing, at the rate the sold ones fetch. */
export interface IdleInventoryReport {
  /** absent when the caller named no period and the server chose one */
  from?: string;
  to?: string;
  outOfServiceRooms: { id: number; name: string }[];
  sellableRooms: number;
  occupancyPct: number;
  netAdr: number;
  foregoneInRange: number;
  foregonePerYear: number;
}

export interface AuditRow {
  /** a BigInt on the server, so a string here */
  id: string;
  /** the account's name, or "system" when nothing was signed in */
  actor: string;
  role: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  diff: unknown;
  at: string;
}

/** An agency's own commission, over its own bookings — the one report it may read. */
export interface AgentOwnReport {
  from: string | null;
  to: string | null;
  commissionRate: number;
  commissionKind: string;
  bookings: number;
  rent: number;
  due: number;
  commission: number;
}

// ─────────────────── the account behind the resort ───────────────────

/** The financial years a report can be asked for, newest first. */
export interface FiscalYears {
  /** "07-01" — the day the resort's year turns */
  fyStartMonthDay: string;
  years: { label: string; from: string; to: string }[];
}

/** What a tenant is using, against what its plan allows. */
export interface TenantUsage {
  tenantId: number;
  name: string;
  /** the subscription's plan; `Tenant.plan` was a label that drifted from it */
  plan: string | null;
  planLabel: string;
  limits: { maxResorts: number; maxRoomsPerResort: number };
  resorts: number;
  rooms: number;
  staffUsers: number;
  guests: number;
}

/** What creating or editing a colleague answers with. */
export interface ResortUserSaved {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  status: string;
}

/** What the platform accepts when a resort adds a colleague. */
export interface NewResortUser {
  name: string;
  email: string;
  phone: string;
  password: string;
  /** MANAGER | FRONT_DESK | AGENT | HOUSEKEEPING, and RESORT_ADMIN for the platform owner */
  role: string;
  /** the resort's own role, which is what the permission matrix reads */
  roleId?: number;
}

/**
 * What it accepts when the resort edits one.
 *
 * No `password`: setting one is its own act, its own permission and its
 * own route, because what it does is hand somebody an account.
 */
export interface ResortUserEdit {
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  status?: string;
  /** 0 clears the custom role */
  roleId?: number;
}

// ─────────── what the desk writes: expenses, payroll, cancellations ───────────

/** An expense as it is stored, which is more than a list row shows. */
export interface ExpenseSaved extends ExpenseRow {
  resortId: number | null;
  agencyId: number | null;
  headId: number | null;
  createdBy: number | null;
  /** offline identity: the same entry replayed twice is still one entry */
  clientRef: string | null;
  createdAt: string;
}

export interface NewExpense {
  date: string;
  category: string;
  details?: string;
  amount: number;
  /** RESORT | RESTAURANT */
  scope?: string;
}

/** One payslip line, as it is stored. */
export interface PayrollPaymentSaved {
  id: number;
  resortId: number | null;
  agencyId: number | null;
  employeeId: number;
  month: string;
  amount: number;
  /** ADVANCE — handed over against a month not yet settled; SALARY — settling it */
  kind: string;
  method: string | null;
  note: string | null;
  paidAt: string;
  createdById: number | null;
}

/**
 * Handing an employee money.
 *
 * `amount` is optional only for a settlement, where the server works out
 * what is still owed. An advance with no amount is refused — "give him
 * some money" has no sensible number to invent for it.
 */
export interface PayrollPay {
  month: string;
  amount?: number;
  method?: string;
  note?: string;
  /** ADVANCE | SALARY */
  kind?: string;
}

/** An agency asking; the resort deciding. Two answers, because they are two acts. */
export interface CancelRequested {
  requested: true;
}
export interface CancelDecided {
  approved: boolean;
}

// ─────────────────── running the platform ───────────────────

/**
 * The platform owner's screens, typed from `platform.service.ts`.
 *
 * Every figure on the overview leaves out the accounts the platform
 * opened to try things with, and says so in `demoExcluded` — a total
 * that differs from the list beneath it without explaining why is worse
 * than one that is wrong in a way somebody can see.
 */
export interface PlatformOverview {
  resorts: { total: number; active: number; suspended: number };
  agents: { total: number; pending: number; active: number; suspended: number };
  subscriptions: {
    trial: number;
    active: number;
    pastDue: number;
    cancelled: number;
    /** a year's fee spread across its months, so a sale does not spike the line */
    mrr: number;
  };
  duesOutstanding: number;
  rooms: number;
  /** how many accounts the figures above left out, because they are ours to test with */
  demoExcluded: { resorts: number; agencies: number };
}

/** The subscription as a resort row carries it: enough to badge and to renew. */
export interface PlatformResortSubscription {
  id: string;
  plan: string;
  status: string;
  fee: string;
  scheduleId: number | null;
  /** "Monthly", "Yearly" — the shelf it was bought from */
  scheduleLabel: string | null;
  renewsAt: string | null;
}

export interface PlatformResortRow {
  id: number;
  name: string;
  location: string | null;
  status: string;
  createdAt: string;
  /** the subscription is the account's — every resort of one owner shows the same one */
  tenant: {
    id: number;
    name: string;
    kind: string;
    /** ours, opened to try things with — badged, and out of the totals */
    demo: boolean;
    subscriptions: PlatformResortSubscription[];
  };
  _count: { rooms: number; bookings: number; guests: number };
  userResorts: { user: { id: number; name: string; phone: string | null } }[];
}

export interface PlatformAgentRow {
  id: number;
  name: string;
  phone: string | null;
  status: string;
  createdAt: string;
  bookings: number;
  /** where it has sold: an agent is linked to no resort, so this is the only list there is */
  resorts: { id: number; name: string }[];
  wallet: { balance: number; active: boolean } | null;
}

/** A plan as the panel edits it, with every shelf it is sold from. */
export interface PlanDefinition {
  id: string;
  name: string;
  label: string;
  schedules: {
    id: number;
    label: string;
    active: boolean;
    phases: Phase[];
    openingFee: number;
    perMonth: number;
  }[];
  maxRooms: number;
  maxResorts: number;
  maxStaff: number;
  trialDays: number;
  /** keys from PLAN_FEATURES — what this plan includes, and what it locks */
  features: string[];
  blurb: string | null;
  active: boolean;
  sortOrder: number;
  /** the one plan the pricing page recommends */
  highlight: boolean;
  /** RESORT | AGENCY — the shelf it is sold from */
  audience: string;
}

/** Every field the panel may send. `name` is absent on purpose: it cannot move. */
export interface PlanEdit {
  label?: string;
  maxRooms?: number;
  maxResorts?: number;
  maxStaff?: number;
  trialDays?: number;
  features?: string[];
  blurb?: string;
  active?: boolean;
  sortOrder?: number;
  highlight?: boolean;
  /** RESORT | AGENCY. Fixed once the plan has been sold — the API refuses a move. */
  audience?: string;
}

/** A subscription bill, raised per period. */
export interface SubscriptionDueRow {
  id: string;
  accountId: number;
  /** the customer billed — a resort owner or an agency, never a resort */
  account: { id: number; name: string; kind: string };
  subscription: { plan: string; status: string };
  subscriptionId: string;
  amount: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  status: string;
  paidAt: string | null;
  paidById: number | null;
  paidMethod: string | null;
  note: string | null;
}

/** A subscription as the platform stores it. */
export interface SubscriptionSaved {
  id: string;
  accountId: number;
  plan: string;
  status: string;
  scheduleId: number | null;
  phaseSeq: number;
  phaseDone: number;
  discountPct: number | null;
  fee: string;
  startedAt: string;
  trialEndsAt: string | null;
  renewsAt: string | null;
  cancelledAt: string | null;
  note: string | null;
}

/** Putting an account on a plan, or moving it to another. */
export interface SetSubscription {
  plan: string;
  fee?: number;
  note?: string;
  trialDays?: number;
  scheduleId?: number;
}

/** A one-off amount a tenant owes, outside the subscription's rhythm. */
export interface PlatformChargeSaved {
  id: number;
  accountId: number | null;
  resortId: number | null;
  kind: string;
  description: string;
  amount: number;
  status: string;
  paidAt: string | null;
  paidById: number | null;
  paidMethod: string | null;
  createdAt: string;
}

/** A resort, held or let back in. */
export interface ResortStatusSaved {
  id: number;
  name: string;
  status: string;
  suspendedReason: string | null;
  suspendedAt: string | null;
}

// ─────────────── what the write routes accept ───────────────

/**
 * The other half of an untyped route.
 *
 * Twenty of these took `body: unknown`, which type-checks anything —
 * a misspelled field, a number sent as a string, a whole object meant
 * for a different route. A response typed `unknown` makes a screen cast;
 * a request typed `unknown` makes the server the first thing that
 * notices, and it notices by refusing at the counter.
 *
 * Every one is written from the service's own parameter list, not from
 * the form that fills it.
 */
export interface NewRoom {
  name: string;
  roomTypeId: number;
  baseRate: number;
}

export interface RoomEdit {
  name?: string;
  baseRate?: number;
  status?: "ACTIVE" | "OUT_OF_SERVICE";
  /** a room entered under the wrong type has to be correctable */
  roomTypeId?: number;
  /** what THIS room takes, whatever its type says */
  extraPersonAllowed?: boolean;
  extraPersonRate?: number;
  extraPersonMax?: number;
}

export interface NewRoomType {
  name: string;
  maxAdults: number;
  maxChildren?: number;
  extraPersonAllowed?: boolean;
  extraPersonRate?: number;
  extraPersonMax?: number;
  amenities?: string[];
}

export interface RoomTypeEdit {
  name?: string;
  maxAdults?: number;
  maxChildren?: number;
  extraPersonAllowed?: boolean;
  extraPersonRate?: number;
  extraPersonMax?: number;
  active?: boolean;
}

export interface NewRatePlan {
  roomTypeId: number;
  dateFrom: string;
  dateTo: string;
  price: number;
}

export interface TaxRuleEdit {
  code?: string;
  label?: string;
  ratePct?: number;
  appliesTo?: string;
  inclusive?: boolean;
  compound?: boolean;
  active?: boolean;
}

export interface NewFoodPackage {
  name: string;
  price: number;
  items?: string;
  active?: boolean;
}

export interface FoodPackageEdit {
  name?: string;
  price?: number;
  items?: string;
  active?: boolean;
}

export interface NewEmployee {
  name: string;
  phone?: string;
  designation?: string;
  salary?: number;
  joinDate?: string;
  active?: boolean;
}

export interface EmployeeEdit {
  name?: string;
  phone?: string;
  designation?: string;
  salary?: number;
  joinDate?: string;
  active?: boolean;
}

export interface NewPermRole {
  name: string;
  permissions: string[];
}

/**
 * Administrator resolves to `*`, so its stored list decides nothing and
 * the server refuses to edit it — a matrix full of boxes that change no
 * behaviour is worse than no boxes, because it reads as control.
 */
export interface PermRoleEdit {
  name?: string;
  permissions?: string[];
}

// ─────────── the agency's own write routes ───────────

export interface TourCategoryEdit {
  name?: string;
  active?: boolean;
  sort?: number;
}

export interface TourPackageLineInput {
  categoryId?: number | null;
  label: string;
  qty?: number;
  unitCost?: number;
  unitPrice?: number;
}

export interface NewTourPackage {
  name: string;
  summary?: string;
  days?: number;
  nights?: number;
  pax?: number;
  active?: boolean;
  items?: TourPackageLineInput[];
  /** offline identity: the same package replayed twice is still one package */
  clientRef?: string;
}

export type TourPackageEdit = Partial<NewTourPackage>;

export interface NewAgencyExpense {
  date: string;
  headId: number;
  details?: string;
  amount: number;
  clientRef?: string;
}

export interface SalesDocLineInput {
  label: string;
  details?: string | null;
  qty?: number;
  unitPrice?: number;
}

export interface NewSalesDoc {
  kind: SalesDocKind;
  clientName: string;
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientAddress?: string | null;
  guestId?: number | null;
  packageId?: number | null;
  issueDate: string;
  validUntil?: string | null;
  currency?: string;
  discount?: number;
  taxRate?: number;
  notes?: string | null;
  terms?: string | null;
  items?: SalesDocLineInput[];
  clientRef?: string;
}

/**
 * Lines cannot change once money has been paid against them: they are a
 * record of what was agreed, and rewriting them rewrites what the money
 * was for. The server refuses; this type does not pretend otherwise.
 */
export type SalesDocEdit = Partial<NewSalesDoc>;

// ─────────── the rest of the platform panel ───────────

/**
 * The platform's cash book: subscription dues, one-off charges and
 * wallet top-ups in one list. Three tables answering one question —
 * what came in, from which customer, and who here confirmed it. With no
 * gateway, this is the only account of the money there is.
 *
 * `total` is the total *of what is shown*: each of the three lists is
 * capped, which is why it is reported beside a range the caller chose
 * rather than as "all time".
 */
export interface PlatformMoneyReceived {
  total: number;
  rows: { name: string; count: number; total: number }[];
  recent: {
    kind: "SUBSCRIPTION" | "CHARGE" | "WALLET_TOPUP";
    id: string;
    at: string | null;
    amount: number;
    method: string | null;
    from: string;
    what: string;
    receivedBy: string | null;
    note: string | null;
  }[];
}

/** One day of the subscription calendar: what falls due, and what renews. */
export interface SubscriptionCalendarCell {
  date: string;
  dues: number;
  dueCount: number;
  renewals: number;
}

/**
 * Every subscription the platform has sold, live and closed.
 *
 * The Resorts tab answers "what is this resort on"; this answers "what
 * has the platform sold, to whom, and what is still owed against it" —
 * the agencies included, which no resort-shaped list can show.
 */
export interface PlatformSubscriptionRow {
  id: string;
  account: { id: number; name: string; kind: string; status: string };
  plan: string;
  pendingPlan: string | null;
  status: string;
  scheduleId: number | null;
  /** the label is what stops ৳25,000 being read as a month's fee */
  scheduleLabel: string | null;
  pendingScheduleId: number | null;
  pendingScheduleLabel: string | null;
  fee: number;
  startedAt: string;
  trialEndsAt: string | null;
  renewsAt: string | null;
  cancelledAt: string | null;
  note: string | null;
  outstanding: number;
}

/** A one-off amount a tenant owes, as the invoice queue lists it. */
export interface PlatformChargeRow {
  id: number;
  /** billed to the customer, the same as a due; the resort is context */
  account: { id: number; name: string; kind: string };
  resort: { id: number; name: string } | null;
  kind: string;
  description: string;
  amount: number;
  status: string;
  paidAt: string | null;
  createdAt: string;
}

/** An invitation or a campaign, and how many accounts came through it. */
export interface OfferRow {
  id: number;
  code: string;
  audience: string;
  plan: string;
  trialDays: number | null;
  discountPct: number | null;
  note: string | null;
  /** set for an invitation: only this address may use it */
  email: string | null;
  resortId: number | null;
  expiresAt: string | null;
  maxUses: number;
  uses: number;
  signups: number;
  createdAt: string;
}

export interface NewOffer {
  audience: string;
  plan: string;
  trialDays?: number;
  discountPct?: number;
  maxUses?: number;
  expiresAt?: string;
  email?: string;
  note?: string;
}

/**
 * An agency waiting for the platform.
 *
 * Verification is the only gate between an agency and every open resort,
 * so this is a queue, verified once — not once per resort.
 */
export interface PlatformAgencyRow {
  id: number;
  name: string;
  status: string;
  suspendedReason: string | null;
  createdAt: string;
  /** ours, opened to try things with — badged, and out of the overview */
  demo: boolean;
  owner: { id: number; name: string; email: string | null; phone: string | null } | null;
  subscription: { plan: string; status: string; trialEndsAt: string | null } | null;
}

/** An account held or let back in; the same shape whichever way it went. */
export interface AccountStatusSaved {
  id: number;
  name: string;
  status: string;
  suspendedReason: string | null;
  suspendedAt: string | null;
}

/** A pack of email credits, waiting on somebody here to say yes. */
export interface EmailCreditOrderRow {
  id: string;
  credits: number;
  price: number;
  status: string;
  note: string | null;
  createdAt: string;
  decidedAt: string | null;
  buyer: string;
  /** a placeholder email is not how to reach the buyer; their phone is */
  buyerContact: string;
  /** the customer billed; an agency has no resort to name */
  accountName: string;
  accountKind: string;
  resortName: string | null;
}

/**
 * One way of buying a plan, as the ladder editor sends and receives it.
 *
 * PUT rather than PATCH on the collection: a ladder is only correct as a
 * unit, and half of one leaves a plan whose next period has no price.
 * `repeats` absent, or null, is the last rung — forever.
 */
export interface PlanScheduleInput {
  label: string;
  active?: boolean;
  phases: { count: number; unit: PeriodUnit; price: number; repeats?: number | null }[];
}

/** What the panel needs to bring a plan into being: one price, then a ladder. */
export interface NewPlan extends PlanEdit {
  name: string;
  label: string;
  /**
   * What one month of it costs to begin with — not a column. It becomes
   * the single rung of the plan's Monthly schedule, because one price is
   * all a form can sensibly ask for before the plan exists to hang
   * shelves off.
   */
  price: number;
  maxRooms: number;
  maxResorts: number;
  trialDays: number;
}

/**
 * An agency's float with the platform, as the platform sees it.
 *
 * Not `AgencyWallet`: that is the agency's own view, and it carries `by`
 * — the name of whoever at the platform moved the money, because an
 * agent handing over 50,000 could not otherwise see who credited it.
 * This route sends the row as stored instead, ids and all.
 */
export interface PlatformWalletTxn {
  id: string;
  walletId: number;
  kind: string;
  /** signed — positive is money into the wallet */
  amount: number;
  balanceAfter: number;
  bookingId: number | null;
  note: string | null;
  /** how the money came, for a top-up somebody took by hand */
  method: string | null;
  createdById: number | null;
  createdAt: string;
}

export interface PlatformWallet {
  balance: number;
  active: boolean;
  /** the last hundred, newest first */
  txns: PlatformWalletTxn[];
}

// ══════════ the routes the console reached by hand ══════════

/**
 * Forty-odd routes the typed client did not carry at all.
 *
 * The `unknown` sweep of 2026-09-21 fixed the routes that were *in* this
 * client and lied about their shape. These are the ones that were never
 * in it: the console called them through its own `fetch` wrapper with a
 * URL written into the JSX and an interface written above it — around a
 * hundred and thirty call sites, every one of them a private copy of a
 * contract this file exists to hold once.
 *
 * Each shape below is read from the service that produces it.
 */

// ── a resort and the agencies that sell for it ──

/** This resort's standing with one agency: blocked or not, and on what terms. */
export interface ResortAgencyTerms {
  accountId: number;
  name: string;
  status: string;
  blocked: boolean;
  /** null when the resort's own rate applies rather than one struck with this agency */
  commissionKind: string | null;
  commissionRate: number | null;
}

/** What one agency's terms come back as after a change. */
export interface ResortAgencyTermsSaved {
  accountId: number;
  blocked: boolean;
  commissionKind: string | null;
  commissionRate: number | null;
}

/** What the resort pays every agent. One rate for the resort, not one per person. */
export interface CommissionTermsRow {
  /** PERCENT | FLAT */
  kind: string;
  rate: number;
}

/** An invitation went out — or was recorded, when no mail could be sent. */
export interface AgencyInvited {
  notified: true;
  emailed: boolean;
}

// ── what happened here ──

export interface ActivityRow {
  id: string;
  actor: { id: number; name: string; role: string; phone: string | null } | null;
  action: string;
  entity: string;
  entityId: string | null;
  diff: unknown;
  createdAt: string;
}

// ── standing offers ──

export interface DiscountOfferRow {
  id: number;
  resortId: number;
  /** RESORT = every room · ROOM_TYPE = one category · ROOM = one particular room */
  scope: string;
  roomTypeId: number | null;
  roomId: number | null;
  name: string;
  /** PERCENT | FLAT */
  kind: string;
  value: string;
  validFrom: string | null;
  validTo: string | null;
  active: boolean;
  createdAt: string;
}

/** The list carries what each offer is attached to, so a row can name it. */
export interface DiscountOfferListRow extends DiscountOfferRow {
  roomType: { id: number; name: string } | null;
  room: { id: number; name: string } | null;
}

export interface NewDiscountOffer {
  scope: "RESORT" | "ROOM_TYPE" | "ROOM";
  roomTypeId?: number;
  roomId?: number;
  name: string;
  kind: "PERCENT" | "FLAT";
  value: number;
  validFrom?: string;
  validTo?: string;
}

export interface DiscountOfferEdit {
  active?: boolean;
  value?: number;
  validFrom?: string;
  validTo?: string;
}

// ── what the resort says to a guest ──

export interface MessageTemplateRow {
  name: string;
  body: string;
  /** true when this resort has written its own */
  custom: boolean;
  /** what the message can be given, so the editor can show it */
  placeholders: string[];
}

export interface MessageTemplateSaved {
  id: number;
  resortId: number;
  name: string;
  body: string;
}

/** Back to the built-in wording, and what that wording is. */
export interface MessageTemplateReset {
  reset: true;
  body: string;
}

// ── keys and webhooks, for a resort and for an agency ──

export interface ApiKeyRow {
  /** a BigInt on the server, so a string here */
  id: string;
  name: string;
  /** the visible half, shown as rm_live_xxxx; the secret is shown once and never again */
  prefix: string;
  /**
   * `["read"]` or `["read","write"]`. Most integrations only read — a
   * site that shows what is free and prints a phone number — and handing
   * that site a key that can also write means a compromised plugin
   * reaches the booking table.
   */
  scopes: string[] | null;
  active: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

/** The one and only time the secret is readable. */
export interface ApiKeyCreated {
  id: string;
  name: string;
  prefix: string;
  secret: string;
}

export interface WebhookEndpointRow {
  id: number;
  url: string;
  active: boolean;
  createdAt: string;
}

/** The one and only time the signing secret is readable. */
export interface WebhookEndpointCreated {
  id: number;
  url: string;
  secret: string;
}

/**
 * What was sent, what came back, and whether anybody is still trying.
 *
 * `state` is the point: "did they get it" is a question the resort will
 * ask, and two nullable timestamps are not an answer anybody can read.
 */
export interface WebhookDeliveryRow {
  id: string;
  event: string;
  attempts: number;
  lastStatus: number | null;
  lastError: string | null;
  deliveredAt: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
  endpoint: { url: string };
  /** "delivered" | "trying" | "gave up" */
  state: string;
}

// ── a resort's own website ──

/** One picture on the site, in the order the owner put it. */
export interface SitePhoto {
  id: number;
  url: string;
  roomTypeId: number | null;
  alt: string | null;
  sortOrder: number;
}

/**
 * The site as the owner is editing it — draft and live in one shape,
 * because `published` is a field rather than a second copy.
 */
export interface SiteDraft {
  slug: string;
  published: boolean;
  publishedAt: string | null;
  template: string;
  headline: string | null;
  intro: string | null;
  amenities: string[];
  themeColor: string | null;
  map: { lat: number; lng: number } | null;
  whatsapp: string | null;
  facebook: string | null;
  instagram: string | null;
  photos: SitePhoto[];
  /** the shelf, so the screen never carries its own copy of the list */
  templates: typeof SITE_TEMPLATES;
  storage: { used: number; quota: number };
}

/**
 * Everything an agency may write on its own page.
 *
 * `hiddenResortIds` is the one field that is not prose: an agency sells
 * every open resort, and this is how it keeps one off its shop window
 * without giving up the right to book it.
 */
export interface AgencySiteEdit {
  headline?: string | null;
  intro?: string | null;
  themeColor?: string | null;
  phone?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  address?: string | null;
  facebook?: string | null;
  instagram?: string | null;
  hiddenResortIds?: number[];
}

/** Everything the owner may write. Each field absent means unchanged. */
export interface SiteEdit {
  template?: string;
  headline?: string | null;
  intro?: string | null;
  amenities?: string[];
  themeColor?: string | null;
  mapLat?: number | null;
  mapLng?: number | null;
  whatsapp?: string | null;
  facebook?: string | null;
  instagram?: string | null;
}

// ── a name of your own ──

/**
 * A claimed domain. The record it carries is `DnsRecord` from
 * `domain.ts` — the same one `dnsRecordFor` builds, not a second
 * description of it — and it is still shown after verification, because
 * a record removed is a domain lost.
 */
export interface DomainRow {
  id: number;
  host: string;
  /** WAITING_FOR_DNS | WAITING_FOR_US | LIVE */
  state: string;
  canonical: boolean;
  verifiedAt: string | null;
  provisionedAt: string | null;
  record: DnsRecord;
}

// ── the bell ──

export interface NotificationRow {
  id: string;
  userId: number;
  resortId: number | null;
  title: string;
  body: string | null;
  /** info | booking | payment | alert | request */
  kind: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationFeed {
  unread: number;
  rows: NotificationRow[];
}

// ── email credits and campaigns ──

export interface CreditPack {
  credits: number;
  price: number;
}

export interface MyEmailCredits {
  credits: number;
  /** how to pay, in the platform's own words — there is no gateway */
  payTo: string;
}

// ── the agency's own roles ──

export interface AgencyRoleSaved {
  id: number;
  name: string;
  permissions: string[];
}

// ── moving a spreadsheet in ──

/**
 * A room type to create when the resort has none.
 *
 * Every field optional: the importer fills what is missing, and the
 * report says whether it had to guess the name — the old importer did
 * that silently and nobody knew there was anything to correct.
 */
export interface RoomTypeChoice {
  name?: string;
  maxAdults?: number;
  maxChildren?: number;
}

export interface ImportRequest {
  csv: string;
  /** true asks what would happen and writes nothing */
  dryRun?: boolean;
  roomType?: RoomTypeChoice;
}

/** What an import did, or would have done — `dryRun` decides which. */
export interface ImportReport {
  dryRun: boolean;
  totalRows: number;
  imported: number;
  skipped: number;
  outOfService: number;
  conflictNoHold: number;
  roomsCreated: string[];
  guestsCreated: number;
  paymentsCreated: number;
  /**
   * Set when the import had to create a room type for a resort that had
   * none. `assumed` is true when the importer picked the name itself, so
   * the screen can point at something the owner may want to correct —
   * the old importer did this silently and nobody knew.
   */
  roomTypeCreated: { name: string; assumed: boolean } | null;
  /** Bookings whose ID was already here but deleted, and which this import replaced. */
  replacedDeleted: number;
  /** Names in Booking Source = Agent rows that matched no agent working here. */
  unmatchedAgents: string[];
  /** Names in the Received By column that matched nobody on this resort's staff. */
  unmatchedReceivers: string[];
  rows: {
    rowNo: number;
    code: string;
    outcome: "imported" | "skipped" | "out_of_service" | "conflict_no_hold";
    detail?: string;
  }[];
}

/** Whether the spreadsheet's own grids agree with what is in the database. */
export interface ReconcileReport {
  datesChecked: number;
  checked: number;
  matched: number;
  cancelledExplained: number;
  unexplainedCount: number;
  unexplained: { date: string; room: string; kind: string; sheet: string; ours: unknown }[];
}

// ─────────── the subscription, as the resort's own owner sees it ───────────

/**
 * A plan on the owner's Subscription tab.
 *
 * Not `PlanOnSale` from `plans-on-sale.ts`: that is the public price
 * list, for somebody who has no account yet. This one is answered
 * against an account that already exists, so it carries `direction` —
 * whether pressing it is a move up, a move down, or where they already
 * are — and nothing about trials or features, which a customer inside
 * the product no longer chooses.
 */
export interface SubscriptionPlanOption {
  name: string;
  label: string;
  /** Every way this plan is sold, in the owner's own order. Never empty. */
  schedules: {
    id: number;
    label: string;
    phases: Phase[];
    /** what the first period costs — the number a change actually charges */
    openingFee: number;
    /** the settle price as a monthly figure: what the saving badge compares */
    perMonth: number;
  }[];
  maxRooms: number;
  maxResorts: number;
  blurb: string | null;
  /** current | upgrade | downgrade | available */
  direction: string;
}

export interface SubscriptionDetail {
  plan: string | null;
  planLabel: string | null;
  blurb: string | null;
  /** TRIAL | ACTIVE | PAST_DUE, or NONE when the resort has no subscription. */
  status: string;
  /** The shelf this account bought on — what a period is, and what it costs. */
  scheduleId: number | null;
  scheduleLabel: string | null;
  /** What this account pays each period: a month's fee, or a year's. */
  fee: number;
  /** The same money per month, so the two rhythms can be compared at a glance. */
  feePerMonth: number;
  startedAt: string | null;
  trialEndsAt: string | null;
  renewsAt: string | null;
  /** A downgrade already asked for, landing at `renewsAt`. */
  pendingPlan: string | null;
  pendingPlanLabel: string | null;
  pendingScheduleId: number | null;
  pendingScheduleLabel: string | null;
  limits: { maxRooms: number; maxResorts: number; label: string };
  usage: { rooms: number; resorts: number };
  outstanding: { amount: number; count: number };
  bills: {
    id: string;
    amount: number;
    periodStart: string;
    periodEnd: string;
    dueDate: string;
    status: string;
    paidAt: string | null;
    note: string | null;
  }[];
  plans: SubscriptionPlanOption[];
}

export interface PlanChangeResult {
  plan: string;
  planLabel: string;
  scheduleId: number;
  scheduleLabel: string;
  /** now — applied; renewal — parked until the period ends; cancelled — a pending change called off. */
  effective: "now" | "renewal" | "cancelled";
  effectiveFrom: string | null;
  /** The pro-rata charge raised. Zero for a downgrade or a trial. */
  charged: number;
}

/**
 * The expense sheet, moved in.
 *
 * `dailyTotalCheck` is the point: the sheet carries its own daily
 * totals, and an import that disagrees with them has read something
 * wrong. Better found here than in a P&L six weeks later.
 */
export interface ExpenseImportReport {
  imported: number;
  skipped: number;
  total: number;
  byDay: { date: string; amount: number }[];
  dailyTotalCheck: {
    compared: number;
    mismatches: { date: string; sheet: number; computed: number }[];
  };
}

/** The restaurant's history, moved in — with the status the sheet claimed. */
export interface FbImportReport {
  imported: number;
  skipped: number;
  statusMismatches: { code: string; sheet: string; computed: string }[];
  bills: unknown[];
}

/** What a bulk send actually did, and what credit is left afterwards. */
export interface CampaignSent {
  sent: number;
  failed: number;
  remaining: number;
  campaignId: string;
}

/**
 * Who a campaign goes to.
 *
 * `MY_GUESTS` is an agency writing to people it booked, wherever it
 * booked them — which is why the resort's plan is not asked about it.
 */
export interface NewCampaign {
  subject: string;
  body: string;
  audience: "RESORT_GUESTS" | "MY_GUESTS" | "AGENTS";
  resortId?: number;
}

/** What an agency took against its own documents, and who took it. */
export interface AgencyMoneyReceived {
  total: number;
  rows: { userId: number | null; name: string; count: number; total: number }[];
  recent: {
    id: number;
    at: string;
    amount: number;
    method: string;
    /** whose money it was */
    from: string;
    /** what it was for */
    document: string;
    receivedBy: string | null;
    note: string | null;
  }[];
}
