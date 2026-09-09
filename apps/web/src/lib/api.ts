"use client";

import { formatMoney, currencySymbol, createApiClient, type MoneyFormat } from "@rh/shared";

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
    // only end the session when we actually HAD one; anonymous 401s (e.g. guest
    // browsing before verification) must not bounce visitors to /login
    if (res.status === 401 && token) {
      setToken(null);
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    throw new ApiError(res.status, String(msg), payload);
  }
  return payload as T;
}

/**
 * Download a file the API produced, with the session's token attached.
 *
 * A plain <a href> cannot carry the Authorization header, and putting the
 * token in the query string would leak it into server logs and browser
 * history. So the file is fetched, turned into a blob and handed to a
 * throwaway link.
 */
export async function download(path: string, fallbackName: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let msg = `Download failed (${res.status})`;
    try {
      msg = ((await res.json()) as { message?: string }).message ?? msg;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, msg);
  }
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const named = /filename="?([^"]+)"?/.exec(disposition)?.[1];
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = named ?? fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * The response shapes live in @rh/shared, so the API, this console and the
 * mobile app cannot drift apart. They are re-exported here because many files
 * import them from "@/lib/api", and moving the definition should not mean
 * touching every one of them.
 */
export type {
  Resort, Me, PermRole,
  BookingRow, BookingDetail, CalendarBooking,
  Room, RoomType, RatePlan, RoomAvail, AgentPricing,
  GuestRow, GuestRoomType, GuestResort, GuestAvailability, GuestTrip,
  Employee, PayrollSheet, FoodPackage, PLReport, ExpenseRow, ExpensePage, DuesReport, DaySheet,
  CmsRow, PlatformSettings, BillingSweepResult, ExportArchive,
  Page, PageRequest,
} from "@rh/shared";
import type { GuestResort, GuestAvailability, GuestTrip } from "@rh/shared";











/**
 * Currency and locale come from the active resort, not from this file.
 *
 * The console shows one resort at a time, so the format is set once when the
 * active resort changes rather than threaded through 86 call sites. When the
 * data layer lands (PLAN-v3 P4) this moves into context with everything else.
 */
let moneyFormat: MoneyFormat = {};

export function setMoneyFormat(format: MoneyFormat) {
  moneyFormat = format;
}

/** An em dash for "not applicable"; a real zero still prints as zero. */
export const money = (n: number | string | null | undefined) =>
  n === null || n === undefined ? "—" : formatMoney(n, moneyFormat);

/** The active resort's currency symbol, for input labels. */
export const cur = () => currencySymbol(moneyFormat);

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

// ── permissions ──

export const permissionsFor = (resortId?: number) =>
  api<{ permissions: string[] }>(`/auth/permissions${resortId ? `?resortId=${resortId}` : ""}`);


// ── payroll ──






/**
 * The typed client, wired to this app's transport.
 *
 * `api()` above stays for the calls that are still hand-rolled; new code goes
 * through `client`, where the route and its response type are written down
 * once in @rh/shared.
 */
export const client = createApiClient(api);
