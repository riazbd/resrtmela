/**
 * CSV out. The mirror of import/csv.ts, and deliberately as small.
 *
 * The BOM is not decoration. Excel on Windows — which is what a resort office
 * in Cox's Bazar or Sajek actually opens a file with — reads a UTF-8 file as
 * the system codepage unless it sees one, so every Bangla guest name arrives as
 * mojibake and the owner concludes the export is broken. Four bytes prevent
 * a support call that would otherwise happen on the first export.
 */

/** UTF-8 byte order mark. */
export const CSV_BOM = "﻿";

export type CsvValue = string | number | boolean | Date | null | undefined;

function cell(v: CsvValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  // quote only when needed, so a plain file stays readable in a text editor
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: CsvValue[][]): string {
  const lines = [headers.map(cell).join(",")];
  for (const row of rows) lines.push(row.map(cell).join(","));
  // CRLF: the line ending Excel expects, and harmless everywhere else
  return CSV_BOM + lines.join("\r\n") + "\r\n";
}
