import { Platform } from "react-native";

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ||
  (Platform.OS === "android" ? "http://10.0.2.2:4000" : "http://localhost:4000");

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let token: string | null = null;

export function setToken(t: string | null) {
  token = t;
}

export function hasToken() {
  return token !== null;
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    // empty
  }
  if (!res.ok) {
    const msg =
      (payload as { message?: string })?.message ??
      (payload as { error?: string })?.error ??
      `Request failed (${res.status})`;
    throw new ApiError(res.status, String(msg));
  }
  return payload as T;
}

// ── shared shapes ──
export interface Resort {
  id: number;
  name: string;
}

export interface Me {
  id: number;
  name: string;
  phone: string;
  role: string;
  resorts: { resort: Resort; commissionRate: number | null }[];
}

export interface BookingRow {
  id: number;
  code: string;
  state: string;
  paymentState: string;
  checkIn: string | null;
  checkOut: string | null;
  guest: { fullName: string; phone: string } | null;
  rooms: (string | null)[];
  nights: number;
  rent: number;
  paid: number;
  due: number;
}

export interface TodayFeed {
  arrivals: BookingRow[];
  departures: BookingRow[];
  occupancyPct: number;
  duesTotal: number;
  duesCount: number;
}

export const bdt = (n: number | null | undefined) =>
  n === null || n === undefined ? "-" : `Tk ${Number(n).toLocaleString("en-IN")}`;

export const dmy = (d: string | null | undefined) =>
  !d ? "-" : new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

// -- guest app --

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
  paid: number;
  due: number;
  discount: number;
}

export const requestOtp = (phone: string) =>
  api<{ sent: boolean; devCode?: string }>("/auth/otp/request", { method: "POST", body: { phone } });

export const verifyOtp = (phone: string, code: string) =>
  api<{ accessToken: string }>("/auth/otp/verify", { method: "POST", body: { phone, code } });

export const guestResorts = () => api<GuestResort[]>("/guest/resorts");
export const guestResort = (id: number) => api<GuestResort>(`/guest/resorts/${id}`);
export const guestAvailability = (id: number, from: string, to: string) =>
  api<GuestAvailability[]>(`/guest/resorts/${id}/availability?from=${from}&to=${to}`);
export const guestBook = (body: unknown) => api<GuestTrip>("/guest/bookings", { method: "POST", body });
export const guestTrips = () => api<GuestTrip[]>("/guest/bookings");
export const guestActivitySlots = (catalogId: number, days = 7) =>
  api<{ id: number; startsAt: string; endsAt: string; remaining: number }[]>(
    `/guest/activities/${catalogId}/slots?days=${days}`,
  );
export const guestAddActivity = (bookingId: number, slotId: number, qty: number) =>
  api<GuestTrip>(`/guest/bookings/${bookingId}/activities`, { method: "POST", body: { slotId, qty } });
export const createCheckout = (bookingId: number, method: string, amount: number) =>
  api<{ intentId: string; providerRef: string; provider: string; amount: number; checkoutUrl: string }>(
    `/bookings/${bookingId}/checkout`,
    { method: "POST", body: { method, amount } },
  );
export const confirmMockCheckout = (ref: string) =>
  api<{ status: string; booking: { code: string; paymentState: string; due: number; paid: number } }>(
    `/mock-checkout/${ref}/confirm`,
    { method: "POST", body: {} },
  );
export const intentStatus = (ref: string) =>
  api<{ status: string; trxId: string | null; paidAt: string | null }>(`/payments/${ref}/status`);
export const guestCancel = (id: number) => api<{ cancelled: boolean }>(`/guest/bookings/${id}/cancel`, { method: "POST" });
