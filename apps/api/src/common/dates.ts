import { createHash, randomUUID } from "node:crypto";

/**
 * How a country writes its phone numbers.
 *
 * `trunkPrefix` is the digit dropped when dialling from abroad — 0 in
 * Bangladesh, India and most of the world; absent in a few places.
 */
export interface PhoneCountry {
  dialCode: string;
  trunkPrefix: string;
  /** digits in a national number, without the trunk prefix */
  nationalLength: number;
}

/**
 * Bangladesh. The default because every customer today is here — but a
 * default, not an assumption baked into the function: an Indian guest's
 * ten-digit number with 880 stapled to the front sends the SMS to a stranger
 * in Dhaka, and nothing anywhere says so.
 */
export const DEFAULT_COUNTRY: PhoneCountry = { dialCode: "880", trunkPrefix: "0", nationalLength: 10 };

/** Normalize a phone to E.164-ish digits: <dialCode><national>, e.g. 8801XXXXXXXXX */
export function normalizePhone(raw: string, country: PhoneCountry = DEFAULT_COUNTRY): string {
  const digits = raw.replace(/\D/g, "");
  const { dialCode, trunkPrefix, nationalLength } = country;
  const full = dialCode.length + nationalLength;

  if (digits.startsWith(dialCode) && digits.length >= full) return digits.slice(0, full);
  if (digits.startsWith(dialCode)) return digits;
  if (digits.length === nationalLength + trunkPrefix.length && digits.startsWith(trunkPrefix)) {
    return dialCode + digits.slice(trunkPrefix.length);
  }
  if (digits.length === nationalLength) return dialCode + digits;
  // anything else — a foreign number, or not a phone number at all — is left
  // as the caller gave it rather than guessed at
  return digits;
}

export function phoneKey(normalizedPhone: string): string {
  return createHash("sha256").update(normalizedPhone).digest("hex");
}

/**
 * A dedup key for a guest there is nothing to dedup on.
 *
 * `phoneKey("")` is a constant, and the walk-in path hashed the guest's *name*
 * instead — so every guest called "local" was one row owning hundreds of
 * unrelated stays, and `UNIQUE(resortId, phoneKey)` could never have been added
 * over it. Two people with no phone and the same name are two people.
 */
export function anonGuestKey(): string {
  return createHash("sha256").update("anon:" + randomUUID()).digest("hex");
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

