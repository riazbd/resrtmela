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
}

export interface Me {
  id: number;
  name: string;
  phone: string;
  role: string;
  resorts: { resort: Resort; commissionRate: number | null }[];
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

// ─────────────────────── the public booking site ───────────────────────

export interface GuestRoomType {
  id: number;
  name: string;
  maxAdults: number;
  maxChildren: number;
  amenities?: string[];
  priceFrom: number | null;
  totalRooms?: number;
}

export interface GuestResort {
  id: number;
  name: string;
  location: string | null;
  roomCount?: number;
  roomTypes?: GuestRoomType[];
  activities?: { id: number; name: string; category: string; price: number; durationMin: number }[];
}

export interface GuestAvailability {
  roomTypeId: number;
  name: string;
  maxAdults: number;
  maxChildren: number;
  total: number;
  available: number;
  pricePerNight: number;
}

export interface GuestTrip {
  id: number;
  code: string;
  resortId?: number;
  resortName?: string;
  resort?: { id: number; name: string; location: string | null };
  state: string;
  paymentState: string;
  checkIn: string | null;
  checkOut: string | null;
  adults?: number;
  children?: number;
  rooms: (string | null)[];
  remarks?: string | null;
  activities?: { itemId: number; name: string; startsAt: string; endsAt: string; qty: number; unitPrice: number }[];
  payments?: { id: number; amount: number; method: string; type: string; receivedAt: string }[];
  nights: number;
  rent: number;
  discount: number;
  paid: number;
  due: number;
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
