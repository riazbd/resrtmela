/**
 * What the reset screen decides for itself.
 *
 * The API already refuses a short password and an expired token, in prose
 * meant to be read (Task 1) — that stays server-side and is shown verbatim on
 * failure. This file is the smaller check in front of it, so the screen does
 * not spend a request finding out the two fields disagree, and it is the one
 * line the "forgot password" form always shows, whichever way the address
 * turns out. Kept out of the page component so both checks have one place to
 * live and one spec to prove them, instead of drifting if written twice.
 */

/** The confirmation shown after asking for a reset link — same wording, sent or not. */
export const RESET_REQUESTED_MESSAGE =
  "If that address has an account, a reset link is on its way.";

/**
 * Why length is checked before the match: a password that is both short and
 * mistyped should read as "too short", the fixable problem closest to what
 * the person will type next — not "doesn't match", which invites retyping
 * the same short password into both boxes.
 */
export function newPasswordError(password: string, confirmation: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (password !== confirmation) return "Passwords do not match.";
  return null;
}
