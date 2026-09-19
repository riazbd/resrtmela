/**
 * The order a resort reads its own rooms in (2026-09-19).
 *
 * A room's name is one string — "3 Snow Drop", "12 Orchid" — so every list of
 * them was sorted as text, and text puts "12" before "2". The rooms screen also
 * grouped by room type first, so an eight-room resort's inventory read
 * 3, 4, 5, 6, 7, 8, 1, 2: a clerk looking for room 2 reads the whole list.
 *
 * The rule the resort uses on its own wall: numbers first and in number order,
 * then whatever is named rather than numbered, alphabetically.
 *
 * Here and shared, not in a `findMany`, for two reasons. SQL cannot do this
 * without a per-dialect expression that nobody will recognise a year from now;
 * and the console sorts too — the room names inside a booking row — so the
 * answer has to be one answer. A resort has tens of rooms, not millions.
 */

/** A name cut into runs of digits and runs of everything else. */
const chunks = (name: string): string[] => name.match(/\d+|\D+/g) ?? [];

const isDigits = (s: string): boolean => s.charCodeAt(0) >= 48 && s.charCodeAt(0) <= 57;

/**
 * Compare two room names the way a person counting rooms would.
 *
 * Chunk by chunk, so a number counts wherever it sits in the name and
 * "Block A 2" comes before "Block A 10". A number always sorts before a word,
 * which is what makes the numbered rooms come first as a group.
 */
export function compareRoomNames(a: string, b: string): number {
  const x = chunks(a.trim());
  const y = chunks(b.trim());
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const p = x[i]!;
    const q = y[i]!;
    const pNum = isDigits(p);
    const qNum = isDigits(q);
    // a number outranks a word: this is what puts room 8 above "Annex"
    if (pNum !== qNum) return pNum ? -1 : 1;
    if (pNum) {
      const d = Number(p) - Number(q);
      if (d !== 0) return d < 0 ? -1 : 1;
      // "07" and "7" are the same room to a reader; keep a stable order anyway
      if (p !== q) return p.length - q.length;
      continue;
    }
    // case-insensitive, and accent-aware, because a name is for reading
    const d = p.localeCompare(q, undefined, { sensitivity: "base" });
    if (d !== 0) return d;
    if (p !== q) return p < q ? -1 : 1;
  }
  return x.length - y.length;
}

/** What the comparator reads a name out of. */
type NameOf<T> = (row: T) => string;

/**
 * A comparator for rows, not strings.
 *
 * Called with a row it sorts by `row.name`, which is what nearly every caller
 * has; called with a function it returns a comparator that reads the name
 * wherever the caller keeps it (`item.room.name`, say).
 */
export function byRoomName<T extends { name: string }>(a: T, b: T): number;
export function byRoomName<T>(nameOf: NameOf<T>): (a: T, b: T) => number;
export function byRoomName<T>(
  a: T | NameOf<T>,
  b?: T,
): number | ((a: T, b: T) => number) {
  if (typeof a === "function") {
    const nameOf = a as NameOf<T>;
    return (l, r) => compareRoomNames(nameOf(l), nameOf(r));
  }
  return compareRoomNames(
    (a as { name: string }).name,
    (b as unknown as { name: string }).name,
  );
}
