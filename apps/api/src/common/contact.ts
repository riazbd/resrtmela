import type { PrismaService } from "../prisma/prisma.service";
import { badRequest } from "./rbac";
import { normalizePhone } from "./dates";

/**
 * The two ways into an account, as every path that writes one stores them.
 *
 * Every user has both (the owner's ruling, 2026-09-11): a person signs in with
 * either, and the password reset mails a link. So every path that creates an
 * account — or changes how someone signs in — goes through here, and stores
 * exactly what `loginWithPassword` will look up. Before this, signup ran
 * phones through `normalizePhone` while the resort and agency paths only
 * stripped non-digits, so a colleague added as `01712…` was stored as
 * `01712…`, login asked for `8801712…`, and nobody was found.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The placeholders, defined once.
 *
 * Migration 20260911130000 gave every account missing an email
 * `user-<id>@placeholder.invalid` and every account missing a phone
 * `placeholder-<id>`, so both columns could be required. SQL cannot import
 * this, so the migration spells the same two shapes out; everything in the
 * API asks here. They are gaps wearing a value: `.invalid` never delivers,
 * and `placeholder-<id>` is not a phone number.
 */
export const PLACEHOLDER_EMAIL_SUFFIX = "@placeholder.invalid";
const PLACEHOLDER_PHONE_PREFIX = "placeholder-";

export function isPlaceholderEmail(value: string | null | undefined): boolean {
  return !!value && value.trim().toLowerCase().endsWith(PLACEHOLDER_EMAIL_SUFFIX);
}

export function isPlaceholderPhone(value: string | null | undefined): boolean {
  return !!value && value.trim().toLowerCase().startsWith(PLACEHOLDER_PHONE_PREFIX);
}

/**
 * The address a person can actually be reached at, or null.
 *
 * For readers. A column that used to be null when unknown now holds a
 * placeholder, so `email ?? phone` never reaches the phone — every reader
 * that contacts someone, or prints how to, asks here instead.
 */
export function reachableEmail(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v && !isPlaceholderEmail(v) ? v : null;
}

export function reachablePhone(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v && !isPlaceholderPhone(v) ? v : null;
}

/**
 * Sent back as it is stored — in the same spelling, or one that normalises to
 * it. For an update: an edit form sends every field with every save, and a
 * field it did not change is not a request to change it.
 */
export function sameEmail(raw: string, stored: string): boolean {
  return raw.trim().toLowerCase() === stored.trim().toLowerCase();
}

export function samePhone(raw: string, stored: string): boolean {
  // the raw comparison is what keeps `placeholder-7` from being normalised to `7`
  return raw.trim() === stored || normalizePhone(raw) === stored;
}

/** Trimmed and lower-cased — the form login compares against. */
export function contactEmail(raw: string | null | undefined): string {
  const email = (raw ?? "").trim().toLowerCase();
  if (!email) throw badRequest("An email address is required — it is where a password reset is sent");
  if (!EMAIL.test(email) || email.length > 191) throw badRequest("That email address does not look right");
  // a placeholder is a gap, not an address: an account given one, or an
  // email replaced by one, could never receive its reset link
  if (isPlaceholderEmail(email)) throw badRequest("That is a placeholder, not an email address — enter the person's real one");
  return email;
}

/** Normalised the way login normalises what is typed at the login box. */
export function contactPhone(raw: string | null | undefined): string {
  const phone = normalizePhone(raw ?? "");
  if (!phone) throw badRequest("A phone number is required");
  if (phone.length > 32) throw badRequest("That phone number is too long");
  return phone;
}

/**
 * Which of the two already signs someone else in, if either.
 *
 * Asked before writing so the person is told in a sentence, instead of the
 * unique index answering with a constraint error. Each caller throws in its
 * own convention — signup says 409 and "sign in instead", the resort and
 * agency paths have always said 400.
 */
export async function contactTaken(
  prisma: Pick<PrismaService, "user">,
  contact: { email?: string; phone?: string },
  exceptUserId?: number,
): Promise<"email" | "phone" | null> {
  const not = exceptUserId != null ? { id: { not: exceptUserId } } : {};
  if (contact.email && (await prisma.user.findFirst({ where: { email: contact.email, ...not }, select: { id: true } }))) {
    return "email";
  }
  if (contact.phone && (await prisma.user.findFirst({ where: { phone: contact.phone, ...not }, select: { id: true } }))) {
    return "phone";
  }
  return null;
}

export const TAKEN_SENTENCE = {
  email: "This email address already belongs to another account",
  phone: "This phone number already belongs to another account",
} as const;
