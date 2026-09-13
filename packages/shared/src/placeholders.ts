/**
 * The placeholders, defined once for every app that reads or writes them.
 *
 * Every account has both an email and a phone (the owner's ruling,
 * 2026-09-11); migration 20260911130000 gave every account missing one a
 * placeholder — `user-<id>@placeholder.invalid` for email, `placeholder-<id>`
 * for phone — so both columns could be required. SQL cannot import this, so the
 * migration spells the same two shapes out by hand; everything else, in the API
 * and in the console, asks here instead. They are gaps wearing a value:
 * `.invalid` never delivers, and `placeholder-<id>` is not a phone number.
 *
 * In its own file rather than in `index.ts`, where it used to live, because
 * `contact.ts` needs it and `index.ts` exports `contact.ts`. Importing the
 * barrel from inside one of its own members is a cycle — it happens to resolve
 * in most bundlers and then stops resolving in one of them, at the worst
 * possible moment.
 */
export const PLACEHOLDER_EMAIL_SUFFIX = "@placeholder.invalid";
export const PLACEHOLDER_PHONE_PREFIX = "placeholder-";

export function isPlaceholderEmail(value: string | null | undefined): boolean {
  return !!value && value.trim().toLowerCase().endsWith(PLACEHOLDER_EMAIL_SUFFIX);
}

export function isPlaceholderPhone(value: string | null | undefined): boolean {
  return !!value && value.trim().toLowerCase().startsWith(PLACEHOLDER_PHONE_PREFIX);
}
