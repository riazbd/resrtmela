import type { PrismaService } from "../prisma/prisma.service";
import { badRequest } from "./rbac";
import { normalizePhone } from "./dates";
import { isPlaceholderEmail, isPlaceholderPhone, PLACEHOLDER_EMAIL_SUFFIX } from "@rh/shared";

export { PLACEHOLDER_EMAIL_SUFFIX, isPlaceholderEmail, isPlaceholderPhone };

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
 * The placeholders themselves now live in `packages/shared` (Task 12) so the
 * console can recognise one without duplicating the shape — a form that
 * cannot tell a placeholder from a real address would offer to "edit" the
 * fake one, or show it in a list as though someone typed it. Re-exported
 * here so every existing import of `./contact` in this API keeps working.
 */

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
 * The one rule for turning what somebody typed into an account: an "@" means
 * an email (trimmed, lower-cased, the way it is stored); anything else is a
 * phone, read through the same `normalizePhone` every path stores one with.
 *
 * `loginWithPassword` had this branch inline; the password reset needed the
 * identical rule — an account reachable by either has to be *findable* by
 * either — so it moved here rather than being typed out a second time for a
 * second caller to drift from the first.
 */
export async function findUserByIdentifier<T extends Pick<PrismaService, "user">>(
  prisma: T,
  identifierRaw: string,
) {
  if (!identifierRaw) return null;
  if (identifierRaw.includes("@")) {
    return prisma.user.findFirst({ where: { email: identifierRaw.trim().toLowerCase() } });
  }

  const exact = await prisma.user.findFirst({ where: { phone: normalizePhone(identifierRaw) } });
  if (exact) return exact;

  /**
   * The number as it is stored, when that is not the number as it should be.
   *
   * Reported as "you have to type an extra 88 to sign in". Some accounts hold
   * a phone a digit short — `880` and nine, where a Bangladeshi mobile is
   * `880` and ten — so `normalizePhone("0170000101")` produces a correct
   * thirteen that matches nothing, while typing the stored twelve verbatim
   * matches exactly. The person is then told their own number is wrong
   * because of how it was written into the table before they saw a login
   * screen.
   *
   * So: fall back to the national part, the digits after the country code and
   * any trunk zero. Nine digits at minimum — a suffix shorter than that would
   * start matching strangers — and only when exactly one account ends that
   * way. Two candidates is a refusal, because signing somebody into the wrong
   * account is the one outcome worse than asking them to type more.
   *
   * Runs only after the exact match misses, and the user table is staff and
   * agents rather than guests, so the scan is small.
   */
  const national = identifierRaw.replace(/\D/g, "").replace(/^880/, "").replace(/^0/, "");
  if (national.length < 9) return null;
  const candidates = await prisma.user.findMany({
    where: { phone: { endsWith: national } },
    take: 2,
  });
  return candidates.length === 1 ? candidates[0]! : null;
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
