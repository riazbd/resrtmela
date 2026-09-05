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

/** Sheet formats: 17-Aug-2026 | 8/18/2026 (M/D/Y) | 2026-08-18 → UTC midnight */
export function parseSheetDate(raw: string | undefined | null): Date | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;

  let m = s.match(/^(\d{1,2})[-/\s.]+([A-Za-z]{3,})[-/\s.]+(\d{4})$/);
  if (m) {
    const mo = MONTHS[m[2]!.slice(0, 3).toLowerCase()];
    if (mo !== undefined) return new Date(Date.UTC(Number(m[3]), mo, Number(m[1])));
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2])));
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));

  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
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

export type BookingSource = "DIRECT" | "AGENT" | "FACEBOOK" | "WHATSAPP" | "PHONE" | "APP";

export function mapSheetSource(raw: string | undefined | null): BookingSource {
  const s = (raw ?? "").trim().toLowerCase();
  if (s.startsWith("agent")) return "AGENT";
  if (s.includes("facebook") || s === "fb") return "FACEBOOK";
  if (s.includes("whatsapp")) return "WHATSAPP";
  if (s.includes("phone")) return "PHONE";
  if (s === "app") return "APP";
  return "DIRECT";
}
