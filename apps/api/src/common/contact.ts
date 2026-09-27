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
 * The one rule for turning what somebody typed into an account: the email
 * address, trimmed and lower-cased, the way it is stored.
 *
 * It accepted a phone number too until 2026-09-28, and it cannot any more.
 * `users.phone` stopped being unique that day, so that one person with one
 * SIM could hold both a resort account and an agency account — which the
 * owner of both asked for, and which no second SIM can solve. A number that
 * two accounts answer to cannot say which was meant, and signing somebody
 * into the wrong account is worse than asking for their email.
 *
 * So: no guessing, no "the only one that matched", and no quiet
 * best-of-two. A phone typed here is refused in a sentence that says what
 * to type instead, because the alternative is "Invalid identifier or
 * password" in front of somebody whose password is perfectly good.
 *
 * `loginWithPassword` had the old branch inline; the password reset needed
 * the identical rule, so it lives here and has one caller's worth of truth
 * rather than two that can drift.
 */
export const EMAIL_ONLY_SENTENCE =
  "Sign in with your email address — a phone number can belong to more than one account";

/** Whether what was typed is meant to be an email at all. */
export function looksLikeEmail(raw: string | null | undefined): boolean {
  return (raw ?? "").includes("@");
}

export async function findUserByIdentifier<T extends Pick<PrismaService, "user">>(
  prisma: T,
  identifierRaw: string,
) {
  const email = (identifierRaw ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return null;
  return prisma.user.findFirst({ where: { email } });
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
 * Whether the email already signs someone else in.
 *
 * Asked before writing so the person is told in a sentence, instead of the
 * unique index answering with a constraint error. Each caller throws in its
 * own convention — signup says 409 and "sign in instead", the resort and
 * agency paths have always said 400.
 *
 * The phone is no longer asked about. It stopped being unique on
 * 2026-09-28: a resort's owner and an agency's owner are frequently the
 * same person, and that person has one number. The refusal it used to
 * produce was the whole obstacle. `contact.phone` is still accepted as an
 * argument so that no caller had to be found and changed, and it is
 * deliberately ignored — a silent parameter being safer here than twelve
 * edited call sites, each a chance to drop the email check with it.
 */
export async function contactTaken(
  prisma: Pick<PrismaService, "user">,
  contact: { email?: string; phone?: string },
  exceptUserId?: number,
): Promise<"email" | null> {
  const not = exceptUserId != null ? { id: { not: exceptUserId } } : {};
  if (contact.email && (await prisma.user.findFirst({ where: { email: contact.email, ...not }, select: { id: true } }))) {
    return "email";
  }
  return null;
}

export const TAKEN_SENTENCE = {
  email: "This email address already belongs to another account",
  /**
   * Kept, and never reached. The phone stopped being unique on 2026-09-28,
   * so nothing produces this any more — it stays so that the two sentences
   * can be read side by side by whoever wonders why one of them vanished.
   */
  phone: "This phone number already belongs to another account",
} as const;
