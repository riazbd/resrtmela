"use client";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:4000";

export class ApiError extends Error {
  status: number;
  payload: unknown;
  constructor(status: number, message: string, payload?: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("rh.token");
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem("rh.token", token);
  else window.localStorage.removeItem("rh.token");
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = getToken();
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
    // empty body
  }
  if (!res.ok) {
    const msg =
      (payload as { message?: string })?.message ??
      (payload as { error?: string })?.error ??
      `Request failed (${res.status})`;
    if (res.status === 401) {
      setToken(null);
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    throw new ApiError(res.status, String(msg), payload);
  }
  return payload as T;
}

// â”€â”€ shared shapes (loose, dashboard-side) â”€â”€

export interface Resort {
  id: number;
  name: string;
  tenantId: number;
  status: string;
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

export interface RoomAvail {
  roomId: number;
  roomName: string;
  roomTypeId: number;
  baseRate: number;
  status: string;
  busyNights: string[];
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

export interface Room {
  id: number;
  resortId: number;
  roomTypeId: number;
  name: string;
  baseRate: string | number;
  status: "ACTIVE" | "OUT_OF_SERVICE";
  roomType?: RoomType;
}

export interface RoomType {
  id: number;
  name: string;
  maxAdults: number;
  maxChildren: number;
  amenities?: string[];
  active: boolean;
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

export interface GuestRow {
  id: number;
  fullName: string;
  phone: string;
  nidPassportNo: string | null;
  bookingCount: number;
  lastStay: { code: string; checkIn: string | null; checkOut: string | null; state: string } | null;
}

export const bdt = (n: number | string | null | undefined) =>
  n === null || n === undefined
    ? "—"
    : `৳${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export const dmy = (d: string | Date | null | undefined) =>
  !d
    ? "—"
    : new Date(d).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "2-digit",
      });

export const iso = (d: Date) => d.toISOString().slice(0, 10);

// ── guest web booking ──

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

export const guestResorts = () => api<GuestResort[]>("/guest/resorts");
export const guestResort = (id: number) => api<GuestResort>(`/guest/resorts/${id}`);
export const guestAvailability = (id: number, from: string, to: string) =>
  api<GuestAvailability[]>(`/guest/resorts/${id}/availability?from=${from}&to=${to}`);
export const guestBook = (body: unknown) => api<GuestTrip>("/guest/bookings", { method: "POST", body });
export const guestTrips = () => api<GuestTrip[]>("/guest/bookings");
export const guestCancel = (id: number) =>
  api<{ cancelled: boolean }>(`/guest/bookings/${id}/cancel`, { method: "POST" });
export const guestOtpRequest = (phone: string) =>
  api<{ sent: boolean; devCode?: string }>("/auth/otp/request", { method: "POST", body: { phone } });
export const guestOtpVerify = (phone: string, code: string) =>
  api<{ accessToken: string }>("/auth/otp/verify", { method: "POST", body: { phone, code } });