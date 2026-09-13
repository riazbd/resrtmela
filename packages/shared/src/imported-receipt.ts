/**
 * The note an import leaves on a payment, written and read in one place.
 *
 * When a sheet's receiver column names somebody, the importer writes that name
 * into the payment's note: `received by Rikan (sheet)`. In the client's
 * production database 39 of 42 payments carry exactly that, because the owner
 * did record who took their money — and the money report called all of it
 * "Unassigned", because the importer's lookup for a matching user account
 * found nothing and the report only ever read `receivedById`.
 *
 * The first fix considered was making those names linkable to staff accounts.
 * That is the wrong shape: the person who took cash at the gate may never log
 * in, and inventing a login so a report reads properly is a worse answer than
 * the report reading properly. The name is evidence the owner recorded
 * themselves, so the report shows it — labelled as the sheet's word rather
 * than the app's, and nothing is written anywhere to make it true.
 *
 * Both halves live here because two files have to agree on one string. The
 * importer formats, the report parses, and a change to either is a change to
 * both.
 */
const PREFIX = "received by ";
const SUFFIX = " (sheet)";

/** What the importer writes when the sheet names a receiver. */
export function sheetReceiptNote(name: string): string {
  return `${PREFIX}${name}${SUFFIX}`;
}

/**
 * The name inside that note, or null for any other note.
 *
 * An exact envelope rather than a pattern. This note is written by one line of
 * the importer and nowhere else, so matching it exactly is precise; a regex
 * over free text would sooner or later read a note somebody typed by hand and
 * put a name on money they never meant.
 */
export function sheetReceiptName(note: string | null | undefined): string | null {
  if (!note || !note.startsWith(PREFIX) || !note.endsWith(SUFFIX)) return null;
  const name = note.slice(PREFIX.length, note.length - SUFFIX.length).trim();
  return name || null;
}
