"use client";

import { ApiError, formatMoney, currencySymbol, createApiClient, type MoneyFormat } from "@rh/shared";

// one definition, in a module a server component may also import
import { API_URL } from "./api-url";
export { API_URL };

/**
 * `ApiError` moved to `@rh/shared` and is re-exported here, where every caller
 * already looks for it. It had to move: the offline queue decides whether a
 * failed write is worth retrying by reading its status, and this module is
 * `"use client"` — so asking that question used to mean importing the browser,
 * which a phone cannot do.
 */
export { ApiError };

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
    // only end the session when we actually HAD one; anonymous 401s (e.g. a
    // wrong-password attempt on /auth/login, made before any token exists)
    // must not bounce visitors to /login
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
 * Send a file to the API as itself.
 *
 * `api()` writes JSON, and a photograph sent as JSON is base64 — a third
 * larger, for a picture that may be several megabytes. The API gives `image/*`
 * its own body parser precisely so the bytes can travel as bytes, and this is
 * the client half of that. Headers rather than a query string for the extras,
 * because a caption belongs in a header and not in a server log.
 */
export async function upload<T = unknown>(
  path: string,
  file: Blob,
  extra: Record<string, string> = {},
): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extra,
    },
    body: file,
  });
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    // empty body
  }
  if (!res.ok) {
    const msg =
      (payload as { message?: string })?.message ?? `Upload failed (${res.status})`;
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
 * The response shapes live in @rh/shared, so the API and this console cannot
 * drift apart. They are re-exported here because many files
 * import them from "@/lib/api", and moving the definition should not mean
 * touching every one of them.
 */
export type {
  Resort, Me, PermRole,
  BookingRow, BookingDetail, BookingQuote, QuoteLine, CalendarBooking,
  TodayRow, TodayFeed, PaymentRow, PaymentReceipt,
  Room, RoomType, RatePlan, RoomAvail, AgentPricing,
  GuestRow,
  Employee, PayrollSheet, FoodPackage, PLReport, ExpenseRow, ExpensePage, DuesReport, DaySheet,
  CmsRow, PlatformSettings, BillingSweepResult, ExportArchive,
  Page, PageRequest,
} from "@rh/shared";











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

// ── permissions ──

export const permissionsFor = (resortId?: number) =>
  api<{ permissions: string[]; features?: string[] }>(`/auth/permissions${resortId ? `?resortId=${resortId}` : ""}`);


// ── payroll ──






/**
 * The typed client, wired to this app's transport.
 *
 * `api()` above stays for the calls that are still hand-rolled; new code goes
 * through `client`, where the route and its response type are written down
 * once in @rh/shared.
 */
export const client = createApiClient(api);
