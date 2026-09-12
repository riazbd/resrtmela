/**
 * Minimal RFC-4180-ish CSV parser: handles quoted fields, embedded commas,
 * newlines and escaped quotes — the Sky Eco sheet uses all three.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const s = text.replace(/^\uFEFF/, ""); // strip BOM

  while (i < s.length) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  // last field/row (no trailing newline)
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || (r[0] ?? "").trim() !== "");
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * A year as a sheet writes it.
 *
 * Two digits mean this century. A booking register is about now — `26` is
 * 2026 — and `99` on one is somebody's typo rather than 1999; reading it as
 * 2099 keeps it visible as a wrong date instead of silently inventing a
 * plausible past one.
 */
function sheetYear(raw: string): number {
  const n = Number(raw);
  return raw.length <= 2 ? 2000 + n : n;
}

/**
 * Sheet formats: 17-Aug-2026 | 17-Aug-26 | 8/18/2026 | 8/18/26 | 2026-08-18,
 * all to **UTC midnight**.
 *
 * The two-digit year is not a nicety. Without it `21-Aug-26` matched none of
 * the patterns and fell through to `new Date(s)`, which reads a bare date as
 * *local* midnight — 18:00 UTC the previous day in Dhaka. Every reader takes
 * the UTC date part, because every other branch here produces UTC midnight, so
 * an imported sheet arrived with all of its dates one day early. The sheet
 * that found it had 168 rows and not one four-digit year in it.
 */
export function parseSheetDate(raw: string | undefined | null): Date | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;

  let m = s.match(/^(\d{1,2})[-/\s.]+([A-Za-z]{3,})[-/\s.]+(\d{2}|\d{4})$/);
  if (m) {
    const mo = MONTHS[m[2]!.slice(0, 3).toLowerCase()];
    if (mo !== undefined) return new Date(Date.UTC(sheetYear(m[3]!), mo, Number(m[1])));
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) return new Date(Date.UTC(sheetYear(m[3]!), Number(m[1]) - 1, Number(m[2])));
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));

  /**
   * Last resort, and deliberately dragged to UTC midnight.
   *
   * `new Date(s)` reads anything it recognises as local time, which is the
   * bug above in general form: whatever this parses, the rest of the platform
   * will read its UTC date part. Taking the *local* Y-M-D it decided on and
   * rebuilding it in UTC keeps the day the sheet wrote.
   */
  const fallback = new Date(s);
  if (isNaN(fallback.getTime())) return null;
  return new Date(Date.UTC(fallback.getFullYear(), fallback.getMonth(), fallback.getDate()));
}

/** "৳ 12,500 " → 12500 | "" → 0 */
export function parseMoney(raw: string | undefined | null): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return isNaN(n) ? 0 : n;
}

export type BookingState = "PENDING" | "CONFIRMED" | "CHECKED_IN" | "CHECKED_OUT" | "CANCELLED" | "NO_SHOW";

export function mapSheetStatus(raw: string | undefined | null): BookingState {
  const s = (raw ?? "").trim().toLowerCase();
  if (s.startsWith("cancel")) return "CANCELLED";
  if (s.includes("no show") || s === "noshow") return "NO_SHOW";
  if (s.includes("check in") || s.includes("check-in")) return "CHECKED_IN";
  if (s.includes("check out") || s.includes("check-out")) return "CHECKED_OUT";
  if (s.startsWith("pending")) return "PENDING";
  if (s.startsWith("confirm") || s === "") return "CONFIRMED";
  return "CONFIRMED"; // junk tolerance — sheet has stray "0"s here
}

/**
 * The sheet's Source column, matched against codes the resort actually has.
 *
 * This used to end `return "DIRECT"` — so an empty cell, or anything it did not
 * recognise, was filed as a direct booking. In the client's own workbook that
 * is 79 rows out of 96: 76 empty and 3 carrying junk from a shifted row, every
 * one of them claimed as Direct, and the source-mix report then told the owner
 * that is where their business comes from. An unreadable cell is not evidence
 * of anything, so it now returns null and the booking says nothing.
 *
 * `codes` is the resort's own BOOKING_SOURCE list, so a resort that adds a
 * channel can import a sheet naming it without anyone touching this function.
 */
export function mapSheetSource(
  raw: string | undefined | null,
  codes: string[] = [],
): string | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return null;
  // an exact match on the resort's own codes wins over any guess below
  const exact = codes.find((c) => c.toLowerCase() === s || c.toLowerCase().replace(/_/g, " ") === s);
  if (exact) return exact;
  const has = (code: string) => (codes.length === 0 || codes.includes(code) ? code : null);
  if (s.startsWith("agent")) return has("AGENT");
  if (s.includes("facebook") || s === "fb") return has("FACEBOOK");
  if (s.includes("whatsapp")) return has("WHATSAPP");
  if (s.includes("phone")) return has("PHONE");
  if (s === "app") return has("APP");
  if (s.includes("direct") || s.includes("walk")) return has("DIRECT");
  return null;
}
