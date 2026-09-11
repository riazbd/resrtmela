/**
 * What a form decides before it spends a request.
 *
 * Every account now has both an email and a phone (the owner's ruling,
 * 2026-09-11) and the API refuses to write one that is missing either — see
 * `apps/api/src/common/contact.ts`. This is the small, pure check the
 * console's forms run first, so a person sees "an email is required"
 * instead of watching a submit button do nothing, or a 400 nobody explains.
 * It is deliberately lenient: a plausible email shape, a phone with at
 * least 10 digits. The server normalises and has the final word (a
 * duplicate, a placeholder used as a new value) — this module only catches
 * what is obviously missing or malformed.
 *
 * `isPlaceholderEmail` / `isPlaceholderPhone` come from `@rh/shared`, the
 * one definition the API and the console both read, so a loaded row can
 * show "not set" instead of the fake address underneath it.
 */
import { isPlaceholderEmail, isPlaceholderPhone } from "@rh/shared";

export { isPlaceholderEmail, isPlaceholderPhone };

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailError(value: string | null | undefined): string | null {
  const email = (value ?? "").trim();
  if (!email) return "An email address is required.";
  if (!EMAIL_SHAPE.test(email)) return "That email address does not look right.";
  return null;
}

export function phoneError(value: string | null | undefined): string | null {
  const phone = (value ?? "").trim();
  if (!phone) return "A phone number is required.";
  if (phone.replace(/\D/g, "").length < 10) return "A phone number needs at least 10 digits.";
  return null;
}

export interface ContactFields {
  email: string;
  phone: string;
}

/**
 * The edit form's other decision: send only what actually changed.
 *
 * A value equal to the stored one is not a change (compared trimmed, and for
 * email case-insensitively — the same tolerance `sameEmail`/`samePhone` in
 * the API give a resubmit of an unedited field). A placeholder on the
 * loaded row is not a stored value to match against: it stands for "no one
 * ever set this", so typing a real one in is always a change worth sending,
 * even if — improbably — it happened to equal the placeholder string.
 */
export function changedContactFields(next: ContactFields, stored: ContactFields): Partial<ContactFields> {
  const patch: Partial<ContactFields> = {};

  const nextEmail = next.email.trim();
  const storedEmail = isPlaceholderEmail(stored.email) ? "" : stored.email.trim();
  if (nextEmail.toLowerCase() !== storedEmail.toLowerCase()) patch.email = nextEmail;

  const nextPhone = next.phone.trim();
  const storedPhone = isPlaceholderPhone(stored.phone) ? "" : stored.phone.trim();
  if (nextPhone !== storedPhone) patch.phone = nextPhone;

  return patch;
}
