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
  account?: { id: number; name: string; kind: string; status: string; suspendedReason: string | null } | null;
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
