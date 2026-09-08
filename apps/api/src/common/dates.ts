import { createHash } from "node:crypto";

/** Normalize BD-style phones to E.164-ish digits: 8801XXXXXXXXX */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("880") && digits.length >= 13) return digits.slice(0, 13);
  if (digits.length === 11 && digits.startsWith("01")) return "880" + digits.slice(1);
  if (digits.length === 10 && digits.startsWith("1")) return "880" + digits;
  if (digits.startsWith("880")) return digits;
  return digits;
}

export function phoneKey(normalizedPhone: string): string {
  return createHash("sha256").update(normalizedPhone).digest("hex");
}

export function dateOnly(d: Date | string): Date {
  const dt = typeof d === "string" ? new Date(d) : d;
  return new Date(
    Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()),
  );
}

export function nightsBetween(from: Date, to: Date): number {
  const a = dateOnly(from).getTime();
  const b = dateOnly(to).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function eachNight(from: Date, nights: number): Date[] {
  const out: Date[] = [];
  const base = dateOnly(from).getTime();
  for (let i = 0; i < nights; i++) out.push(new Date(base + i * 86_400_000));
  return out;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * The civil date (YYYY-MM-DD) in a timezone.
 *
 * Reading UTC components instead means that between midnight and 06:00 in
 * Dhaka the system believes it is still yesterday — which is what the arrivals
 * list and the check-in reminder sweep used to do, every night.
 *
 * An unrecognised timezone falls back to UTC rather than throwing: a bad
 * settings value must not take the Day Sheet down.
 */
export function civilDateIn(timeZone: string, now: Date = new Date()): string {
  try {
    // en-CA formats as YYYY-MM-DD
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/**
 * Today in a resort's timezone, as the UTC-midnight Date that `@db.Date`
 * columns store — so it compares directly against checkIn/checkOut/night.
 */
export function todayIn(timeZone: string, now: Date = new Date()): Date {
  const [y, m, d] = civilDateIn(timeZone, now).split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

