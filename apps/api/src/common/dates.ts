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

export function today(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}
