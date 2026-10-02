/**
 * The figures above a list — what the bookings, rooms, guests and
 * housekeeping lists add up to, worked out once here so the console and the
 * app draw the same shares from the same rows.
 */
import { MONEY_TONE, SERIES_COLORS, type Tone } from "./chart";
import { bookingStateLabel } from "./booking-state";

/** A booking's state, coloured by what it means for the room. */
export const BOOKING_STATE_TONE: Record<string, Tone> = {
  PENDING: MONEY_TONE.left,
  CONFIRMED: MONEY_TONE.paid,
  CHECKED_IN: MONEY_TONE.advance,
  CHECKED_OUT: MONEY_TONE.deduction,
  CANCELLED: MONEY_TONE.late,
  NO_SHOW: MONEY_TONE.expense,
};

/** How much of a booking is paid. */
export const PAYMENT_STATE_TONE: Record<string, Tone> = {
  PAID: MONEY_TONE.paid,
  PARTIAL: MONEY_TONE.left,
  UNPAID: MONEY_TONE.late,
};

/** A room's housekeeping state. */
export const HOUSEKEEPING_TONE: Record<string, Tone> = {
  DIRTY: MONEY_TONE.late,
  CLEANING: MONEY_TONE.left,
  CLEAN: MONEY_TONE.paid,
};

export interface Share {
  key: string;
  label: string;
  value: number;
  color: string;
}

/** Counts by a key, largest first, each with its colour. */
export function sharesBy<T>(rows: T[], keyOf: (r: T) => string, labelOf: (k: string) => string, tones?: Record<string, Tone>): Share[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(keyOf(r), (counts.get(keyOf(r)) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, value], i) => ({ key, label: labelOf(key), value, color: tones?.[key]?.solid ?? SERIES_COLORS[i % SERIES_COLORS.length]! }));
}

const titled = (s: string) => (s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ") : "Not said");

interface GlanceBooking {
  state: string;
  paymentState: string;
  source: string | null;
  nights: number;
  paid: number;
  due: number;
}

/** What a page of bookings comes to: states, payment, sources, nights and money. */
export function bookingsGlance(rows: GlanceBooking[], sourceLabel: (code: string) => string = titled) {
  const live = rows.filter((r) => r.state !== "CANCELLED" && r.state !== "NO_SHOW");
  return {
    count: rows.length,
    nights: live.reduce((s, r) => s + (r.nights || 0), 0),
    paid: live.reduce((s, r) => s + (r.paid || 0), 0),
    due: live.reduce((s, r) => s + Math.max(0, r.due || 0), 0),
    byState: sharesBy(rows, (r) => r.state, bookingStateLabel, BOOKING_STATE_TONE),
    byPayment: sharesBy(live, (r) => r.paymentState, titled, PAYMENT_STATE_TONE),
    bySource: sharesBy(rows, (r) => r.source ?? "", (k) => (k ? sourceLabel(k) : "Not said")),
  };
}

/** Guests by how often they come back. */
export function guestsGlance(rows: { bookings: number }[]) {
  const once = rows.filter((g) => g.bookings <= 1).length;
  const few = rows.filter((g) => g.bookings >= 2 && g.bookings <= 4).length;
  const many = rows.filter((g) => g.bookings >= 5).length;
  return {
    count: rows.length,
    returning: few + many,
    loyalty: [
      { key: "once", label: "Came once", value: once, color: MONEY_TONE.neutral.solid },
      { key: "few", label: "2–4 stays", value: few, color: MONEY_TONE.advance.solid },
      { key: "many", label: "5+ stays", value: many, color: MONEY_TONE.paid.solid },
    ] satisfies Share[],
  };
}

interface GlanceRoom {
  status: string;
  baseRate: string | number;
  housekeeping?: string;
  roomType?: { name: string } | null;
}

/** What the rooms add up to: how many sell, at what, of which type. */
export function roomsGlance(rooms: GlanceRoom[]) {
  const onSale = rooms.filter((r) => r.status === "ACTIVE");
  const rates = onSale.map((r) => Number(r.baseRate) || 0);
  const types = new Map<string, { count: number; total: number }>();
  for (const r of rooms) {
    const name = r.roomType?.name ?? "No type";
    const t = types.get(name) ?? { count: 0, total: 0 };
    types.set(name, { count: t.count + 1, total: t.total + (Number(r.baseRate) || 0) });
  }
  return {
    count: rooms.length,
    onSale: onSale.length,
    outOfService: rooms.length - onSale.length,
    lowest: rates.length ? Math.min(...rates) : 0,
    highest: rates.length ? Math.max(...rates) : 0,
    average: rates.length ? Math.round(rates.reduce((s, n) => s + n, 0) / rates.length) : 0,
    byType: [...types.entries()].map(([label, t], i) => ({
      key: label,
      label,
      value: t.count,
      average: Math.round(t.total / t.count),
      color: SERIES_COLORS[i % SERIES_COLORS.length]!,
    })),
    sale: [
      { key: "ACTIVE", label: "On sale", value: onSale.length, color: MONEY_TONE.paid.solid },
      { key: "OUT_OF_SERVICE", label: "Out of service", value: rooms.length - onSale.length, color: MONEY_TONE.left.solid },
    ] satisfies Share[],
  };
}

/** How full a stretch of the calendar is: the average, the busiest night, what is left. */
export function calendarGlance(
  occupancy: { day: string; taken: number }[],
  sellable: number,
  bookings: { checkIn: string; state: string }[],
) {
  const nights = occupancy.length * sellable;
  const taken = occupancy.reduce((s, d) => s + d.taken, 0);
  const busiest = occupancy.reduce<{ day: string; taken: number } | null>((b, d) => (!b || d.taken > b.taken ? d : b), null);
  const first = occupancy[0]?.day ?? "";
  const last = occupancy[occupancy.length - 1]?.day ?? "";
  const arrivals = bookings.filter((b) => {
    const d = b.checkIn.slice(0, 10);
    return d >= first && d <= last && b.state !== "CANCELLED" && b.state !== "NO_SHOW";
  }).length;
  return {
    pct: nights ? Math.round((taken / nights) * 100) : 0,
    taken,
    free: Math.max(0, nights - taken),
    busiest,
    arrivals,
    fullNights: occupancy.filter((d) => sellable > 0 && d.taken >= sellable).length,
  };
}

interface GlanceSheetRoom {
  name: string;
  status: string;
  cell: { mode: string; arrives?: boolean; departs?: boolean; revenue?: number | null; due?: number | null; guestName?: string };
}

/** Tonight on the day sheet: who is in, what is free, what each room earns. */
export function daySheetGlance(rooms: GlanceSheetRoom[]) {
  const booked = rooms.filter((r) => r.cell.mode === "booked");
  const free = rooms.filter((r) => r.cell.mode === "available").length;
  const oos = rooms.filter((r) => r.cell.mode === "oos").length;
  const arriving = booked.filter((r) => r.cell.arrives).length;
  return {
    booked: booked.length,
    free,
    oos,
    parts: [
      { key: "arriving", label: "Arriving", value: arriving, color: MONEY_TONE.advance.solid },
      { key: "staying", label: "Staying on", value: booked.length - arriving, color: MONEY_TONE.paid.solid },
      { key: "free", label: "Free", value: free, color: MONEY_TONE.neutral.solid },
      { key: "oos", label: "Out of service", value: oos, color: MONEY_TONE.left.solid },
    ] satisfies Share[],
    earning: booked
      .map((r) => ({ label: r.name, sub: r.cell.guestName ?? "", value: Number(r.cell.revenue ?? 0), due: Number(r.cell.due ?? 0) }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value),
  };
}

interface GlanceBill {
  billDate?: string;
  roomId?: number | null;
  items?: { name: string; qty: number; total?: number; unitPrice?: number }[];
  total: number;
  paid?: number;
  due: number;
}

/** What the restaurant sold over a range: by day, by dish, room or walk-in, paid or not. */
export function fbGlance(bills: GlanceBill[]) {
  const byDay = new Map<string, number>();
  const byItem = new Map<string, { qty: number; total: number }>();
  for (const b of bills) {
    // a bill without its date (an older payload) still counts, on no day
    const d = (b.billDate ?? "").slice(0, 10);
    if (d) byDay.set(d, (byDay.get(d) ?? 0) + (b.total || 0));
    for (const it of b.items ?? []) {
      const t = byItem.get(it.name) ?? { qty: 0, total: 0 };
      byItem.set(it.name, { qty: t.qty + (it.qty || 0), total: t.total + (it.total ?? (it.qty || 0) * (it.unitPrice || 0)) });
    }
  }
  const total = bills.reduce((s, b) => s + (b.total || 0), 0);
  const toRoom = bills.filter((b) => b.roomId != null).reduce((s, b) => s + (b.total || 0), 0);
  return {
    count: bills.length,
    total,
    paid: bills.reduce((s, b) => s + (b.paid || 0), 0),
    due: bills.reduce((s, b) => s + Math.max(0, b.due || 0), 0),
    byDay: [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([day, value]) => ({ day, value })),
    items: [...byItem.entries()].sort((a, b) => b[1].total - a[1].total).map(([label, t]) => ({ label, sub: `${t.qty} sold`, value: t.total })),
    where: [
      { key: "room", label: "On a room", value: toRoom, color: MONEY_TONE.advance.solid },
      { key: "walk", label: "Walk-in", value: total - toRoom, color: MONEY_TONE.income.solid },
    ] satisfies Share[],
  };
}

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

interface GlanceActivity {
  name: string;
  category: string;
  basePrice: number;
  active: boolean;
  upcomingSlots: number;
  schedules: { weekday: number; capacity: number; active?: boolean }[];
}

/** The week's activity schedule as seats per weekday, and what sells at what price. */
export function activitiesGlance(acts: GlanceActivity[], categoryLabel: (code: string) => string = titled) {
  const live = acts.filter((a) => a.active);
  const seats = WEEKDAY_SHORT.map((label, weekday) => ({
    label,
    value: live.reduce((s, a) => s + a.schedules.filter((x) => x.weekday === weekday && x.active !== false).reduce((n, x) => n + x.capacity, 0), 0),
  }));
  return {
    onSale: live.length,
    paused: acts.length - live.length,
    upcoming: live.reduce((s, a) => s + a.upcomingSlots, 0),
    seats,
    byCategory: sharesBy(acts, (a) => a.category, categoryLabel),
    prices: [...acts].sort((a, b) => b.basePrice - a.basePrice).map((a) => ({ label: a.name, sub: categoryLabel(a.category), value: a.basePrice })),
  };
}

/** What a bill is made of, and how much of it has been paid. */
export function billParts(q: { roomRent: number; rent: number; tax: number; total: number }, paid: number) {
  const extra = Math.max(0, q.rent - q.roomRent);
  return {
    made: [
      { key: "rooms", label: "Rooms", value: Math.max(0, q.roomRent), color: MONEY_TONE.paid.solid },
      { key: "extra", label: "Extra persons", value: extra, color: MONEY_TONE.advance.solid },
      { key: "tax", label: "Tax", value: Math.max(0, q.tax), color: MONEY_TONE.left.solid },
    ].filter((p) => p.value > 0) satisfies Share[],
    money: [
      { key: "paid", label: "Paid", value: Math.min(Math.max(0, paid), Math.max(0, q.total)), color: MONEY_TONE.paid.solid },
      { key: "left", label: "Left to pay", value: Math.max(0, q.total - paid), color: MONEY_TONE.late.solid },
    ] satisfies Share[],
  };
}

/** Each night of a stay, and whether it is behind, tonight or still to come. */
export function stayNights(checkIn: string | null, checkOut: string | null, today: string) {
  if (!checkIn || !checkOut) return [];
  const out: { day: string; date: number; weekday: string; when: "past" | "tonight" | "ahead" }[] = [];
  let d = checkIn.slice(0, 10);
  const end = checkOut.slice(0, 10);
  for (let i = 0; d < end && i < 60; i++) {
    const at = new Date(`${d}T00:00:00Z`);
    out.push({ day: d, date: at.getUTCDate(), weekday: WEEKDAY_SHORT[at.getUTCDay()]!, when: d < today ? "past" : d === today ? "tonight" : "ahead" });
    at.setUTCDate(at.getUTCDate() + 1);
    d = at.toISOString().slice(0, 10);
  }
  return out;
}

export const NIGHT_TONE: Record<"past" | "tonight" | "ahead", Tone> = {
  past: MONEY_TONE.deduction,
  tonight: MONEY_TONE.advance,
  ahead: MONEY_TONE.paid,
};

/** A wallet's balance over time, and what went in and out. */
export function walletGlance(txns: { createdAt: string; amount: number; balanceAfter: number }[]) {
  const ordered = [...txns].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  return {
    in: ordered.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0),
    out: ordered.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0),
    balance: ordered.map((t) => ({ day: t.createdAt.slice(0, 10), value: t.balanceAfter })),
  };
}

/** Quotations or invoices: where they stand, and the money in them. */
export function salesGlance(docs: { status: string; totals: { total: number; paid: number; due: number } }[]) {
  return {
    total: docs.reduce((s, d) => s + d.totals.total, 0),
    paid: docs.reduce((s, d) => s + d.totals.paid, 0),
    due: docs.reduce((s, d) => s + Math.max(0, d.totals.due), 0),
    byStatus: sharesBy(docs, (d) => d.status, titled),
  };
}
