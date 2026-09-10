/**
 * The shapes the API actually returns.
 *
 * These lived in three places: the API's own service return types, a block of
 * interfaces in the web app's api.ts, and a hand-rolled copy in whichever page
 * or screen needed one — 64 of them across the console and 9 more in the
 * mobile app. Three copies of one contract is three chances to drift, and the
 * drift is silent: a renamed field type-checks on both sides and breaks only
 * in the browser.
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
}

export interface Me {
  id: number;
  name: string;
  phone: string;
  role: string;
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
  source: string;
  checkIn: string | null;
  checkOut: string | null;
  guest: { id: number; fullName: string; phone: string };
  agent: string | null;
  rooms: (string | null)[];
  adults: number;
  children: number;
  discount: number;
  nights: number;
  rent: number;
  paid: number;
  due: number;
}

export interface BookingDetail extends BookingRow {
  cancelState: string;
  /** present only for the agent who owns this booking, and only when the resort shows rates */
  agentPricing?: AgentPricing | null;
  invoiceNo?: string;
  remarks: string | null;
  createdBy: { id: number; name: string } | null;
  guest: { id: number; fullName: string; phone: string; nidPassportNo: string | null };
  items: {
    id: number;
    kind: string;
    room: { id: number; name: string; type: string } | null;
    slot: { id: number; startsAt: string; endsAt: string } | null;
    qty: number;
    unitPrice: number | null;
    nights: number;
  }[];
  payments: {
    id: number;
    amount: number;
    method: string;
    type: string;
    receivedBy: string | null;
    receivedAt: string;
    note: string | null;
  }[];
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
  rows: {
    id: number;
    code: string;
    state: string;
    guest: { fullName: string; phone: string };
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

export interface PayrollSheet {
  month: string;
  rows: {
    employeeId: number;
    name: string;
    designation: string | null;
    salary: number;
    paid: boolean;
    amount: number;
    method: string | null;
    note: string | null;
    paidAt: string | null;
    paymentId: number | null;
  }[];
  totals: { expected: number; paid: number; headcount: number; paidCount: number };
}

export interface FoodPackage {
  id: number;
  name: string;
  price: number;
  items: string | null;
  active: boolean;
}

export interface PLReport {
  from: string;
  to: string;
  resort: {
    roomRevenue: number;
    extraPersonRevenue: number;
    otherRevenue: number;
    discounts: number;
    income: number;
    expenses: number;
    payroll: number;
    net: number;
    expenseCategories: { category: string; amount: number }[];
  };
  restaurant: {
    revenue: number;
    expenses: number;
    net: number;
    expenseCategories: { category: string; amount: number }[];
  };
  combined: { income: number; expenses: number; net: number };
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
 * `guestName` and `code` are null for a stay the agency did not sell, unless
 * the resort has turned `showGuestNamesToAgents` on. That is the whole point of
 * the type: an agency needs to know a night is gone without learning whose
 * customer is in the room.
 */
export interface AgencyStay {
  roomId: number;
  checkIn: string;
  checkOut: string;
  mine: boolean;
  state: string;
  guestName: string | null;
  code: string | null;
}

/** One resort's month: the rooms it has, and the nights already taken. */
export interface AgencyResortMonth {
  resort: { id: number; name: string; location: string | null };
  rooms: { id: number; name: string; roomTypeId: number | null; roomTypeName: string | null }[];
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
