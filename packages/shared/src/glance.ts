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
