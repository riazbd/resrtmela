/**
 * Payslips from the console: the shared slip (`@rh/shared/payslip`) in a
 * window of its own, with the print dialog open — print it, or save it as a
 * PDF from there.
 */
import { payslipHtml, type PayrollSheet } from "@rh/shared";
import { money } from "@/lib/api";

/** Opens the print dialog with one payslip per row given; false when pop-ups are blocked. */
export function printPayslips(owner: string, month: string, rows: PayrollSheet["rows"]) {
  const w = window.open("", "_blank", "width=820,height=900");
  if (!w) return false;
  w.document.write(
    payslipHtml(owner, month, rows, (n) => money(n), "<script>window.onload=()=>setTimeout(()=>window.print(),150)</script>"),
  );
  w.document.close();
  return true;
}
