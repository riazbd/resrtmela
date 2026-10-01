/**
 * A payslip: one person, one month, on one page.
 *
 * What the month was worth and how, every taka handed over and when, and what
 * is left — the paper a cook signs and takes home, so "how much did I get in
 * September" has an answer he holds rather than one he asks for.
 *
 * Plain HTML with its own styles, because the console prints it from a
 * browser window and the phone through `expo-print`, and both must print the
 * same slip.
 */
import type { PayrollSheet } from "./api-types";
import { monthName } from "./payroll-rules";

type Row = PayrollSheet["rows"][number];

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const day = (iso: string | Date) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function slip(owner: string, month: string, r: Row, money: (n: number) => string): string {
  const lines: [string, string][] = [
    [r.days < r.daysInMonth ? `Salary — ${r.days} of ${r.daysInMonth} days` : "Salary", money(r.base)],
  ];
  for (const a of r.adjustments) {
    lines.push([
      `${a.kind === "BONUS" ? "Bonus" : "Deduction"}${a.note ? ` — ${esc(a.note)}` : ""}`,
      `${a.kind === "BONUS" ? "+" : "−"} ${money(a.amount)}`,
    ]);
  }
  const paid = r.payments
    .map(
      (p) =>
        `<tr><td>${day(p.paidAt)}</td><td>${p.kind === "ADVANCE" ? "Advance" : "Salary"}${
          p.note ? ` — ${esc(p.note)}` : ""
        }</td><td>${esc(p.method ?? "")}</td><td class="n">${money(p.amount)}</td></tr>`,
    )
    .join("");
  return `
  <section class="slip">
    <header>
      <div><div class="owner">${esc(owner)}</div><div class="muted">Payslip</div></div>
      <div class="right"><div class="month">${esc(monthName(month))}</div><div class="muted">Printed ${day(new Date())}</div></div>
    </header>
    <div class="who">
      <div><span class="muted">Name</span><b>${esc(r.name)}</b></div>
      <div><span class="muted">Designation</span><b>${esc(r.designation ?? "—")}</b></div>
      <div><span class="muted">Monthly salary</span><b>${money(r.salary)}</b></div>
      ${r.phone ? `<div><span class="muted">Phone</span><b>${esc(r.phone)}</b></div>` : ""}
    </div>
    <h3>What the month is worth</h3>
    <table>${lines.map(([l, v]) => `<tr><td>${l}</td><td class="n">${v}</td></tr>`).join("")}
      <tr class="total"><td>Total for the month</td><td class="n">${money(r.due)}</td></tr>
    </table>
    <h3>Handed over</h3>
    ${
      r.payments.length
        ? `<table><tr class="head"><td>Date</td><td>What</td><td>How</td><td class="n">Amount</td></tr>${paid}
           <tr class="total"><td colspan="3">Total handed over</td><td class="n">${money(r.paid)}</td></tr></table>`
        : `<p class="muted">Nothing yet.</p>`
    }
    ${r.aheadUsed > 0 ? `<p class="muted">Paid ahead in earlier months, used here: ${money(r.aheadUsed)}</p>` : ""}
    <div class="left ${r.remaining > 0 ? "due" : "done"}">
      <span>${r.remaining > 0 ? "Still to be paid" : "Fully paid"}</span><b>${money(r.remaining)}</b>
    </div>
    ${r.arrears > 0 ? `<p class="muted">Also still to be paid from earlier months: ${money(r.arrears)}</p>` : ""}
    <footer><div>Received by</div><div>Paid by</div></footer>
  </section>`;
}

const CSS = `
  *{box-sizing:border-box} body{font:13px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#0f172a;margin:0;padding:24px;background:#f8fafc}
  .slip{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:28px;max-width:720px;margin:0 auto 24px;page-break-after:always}
  header{display:flex;justify-content:space-between;border-bottom:3px solid #16a34a;padding-bottom:12px;margin-bottom:16px}
  .owner{font-size:20px;font-weight:800}.month{font-size:16px;font-weight:700}.right{text-align:right}.muted{color:#64748b;font-size:12px}
  .who{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin-bottom:12px}.who div{display:flex;flex-direction:column}
  h3{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:18px 0 6px}
  table{width:100%;border-collapse:collapse}td{padding:6px 4px;border-bottom:1px solid #f1f5f9}.n{text-align:right;font-variant-numeric:tabular-nums}
  tr.head td{font-size:11px;color:#64748b;text-transform:uppercase}tr.total td{font-weight:700;border-top:2px solid #e2e8f0}
  .left{display:flex;justify-content:space-between;align-items:center;margin-top:18px;padding:12px 16px;border-radius:12px;font-size:15px}
  .left.due{background:#fef3c7;color:#92400e}.left.done{background:#dcfce7;color:#166534}
  footer{display:flex;justify-content:space-between;gap:48px;margin-top:48px}footer div{flex:1;border-top:1px solid #94a3b8;padding-top:6px;color:#64748b;font-size:12px}
  @media print{body{background:#fff;padding:0}.slip{border:none;margin:0;max-width:none}}
`;

/** A whole printable page: one payslip per row given. */
export function payslipHtml(
  owner: string,
  month: string,
  rows: Row[],
  money: (n: number) => string,
  extraHead = "",
): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Payslips — ${esc(
    monthName(month),
  )}</title><style>${CSS}</style>${extraHead}</head><body>${rows.map((r) => slip(owner, month, r, money)).join("")}</body></html>`;
}
