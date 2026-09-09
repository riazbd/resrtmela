/**
 * A quotation or an invoice, rendered for a client to read.
 *
 * The agency asked that the document show *in* the email. A client who has to
 * download an attachment to find out what a trip costs mostly does not, and an
 * agency that gets no answer cannot tell a lost sale from an unopened PDF. So
 * the document is the email body, and the same markup prints from the browser
 * when a paper copy is wanted.
 *
 * Pure on purpose: no database, no mail server, so what the client sees can be
 * asserted directly.
 */

export interface RenderLine {
  label: string;
  details?: string | null;
  qty: number;
  unitPrice: number;
}

export interface RenderDoc {
  kind: "QUOTATION" | "INVOICE";
  number: string;
  issueDate: string;
  validUntil?: string | null;
  currency: string;
  clientName: string;
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientAddress?: string | null;
  agencyName: string;
  agencyEmail?: string | null;
  agencyPhone?: string | null;
  items: RenderLine[];
  totals: { subtotal: number; discount: number; tax: number; total: number; paid: number; due: number };
  taxRate: number;
  notes?: string | null;
  terms?: string | null;
}

/** `&` before the rest, or the escaping undoes itself. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Bengali digit grouping is not the Western one — 1,50,000 rather than
 * 150,000 — and `en-IN` is the locale that groups that way. A client reading
 * an unfamiliar grouping reads the wrong number.
 */
export function amount(value: number, currency: string): string {
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
  return `${currency === "BDT" ? "৳" : `${currency} `}${formatted}`;
}

const TITLE = { QUOTATION: "Quotation", INVOICE: "Invoice" } as const;

export function subjectFor(doc: RenderDoc): string {
  return `${TITLE[doc.kind]} ${doc.number} from ${doc.agencyName}`;
}

/**
 * Tables and inline styles, not flexbox and a stylesheet: mail clients drop
 * `<style>` blocks and know nothing of modern layout, and a document that
 * arrives as a stack of unstyled lines is worse than no document.
 */
export function renderSalesDoc(doc: RenderDoc): string {
  const money = (n: number) => escapeHtml(amount(n, doc.currency));
  const cell = "padding:10px 12px;border-bottom:1px solid #e8e5e0;font-size:14px";
  const right = `${cell};text-align:right;white-space:nowrap`;

  const lines = doc.items
    .map(
      (i) => `<tr>
      <td style="${cell}">${escapeHtml(i.label)}${
        i.details ? `<div style="color:#7a736a;font-size:12px;margin-top:2px">${escapeHtml(i.details)}</div>` : ""
      }</td>
      <td style="${right}">${escapeHtml(String(i.qty))}</td>
      <td style="${right}">${money(i.unitPrice)}</td>
      <td style="${right}">${money(round2(i.qty * i.unitPrice))}</td>
    </tr>`,
    )
    .join("");

  const totalRow = (label: string, value: string, strong = false) => `<tr>
      <td colspan="3" style="${right};${strong ? "font-weight:700" : "color:#7a736a"}">${escapeHtml(label)}</td>
      <td style="${right};${strong ? "font-weight:700;font-size:16px" : ""}">${value}</td>
    </tr>`;

  const optional = [
    doc.totals.discount > 0 ? totalRow("Discount", `− ${money(doc.totals.discount)}`) : "",
    doc.totals.tax > 0 ? totalRow(`Tax (${doc.taxRate}%)`, money(doc.totals.tax)) : "",
    doc.totals.paid > 0 ? totalRow("Paid", `− ${money(doc.totals.paid)}`) : "",
    doc.totals.paid > 0 ? totalRow("Due", money(doc.totals.due), true) : "",
  ].join("");

  const contact = [doc.clientPhone, doc.clientEmail, doc.clientAddress]
    .filter(Boolean)
    .map((v) => escapeHtml(String(v)))
    .join(" · ");

  const footer = [
    doc.notes ? `<p style="margin:16px 0 0;font-size:13px;color:#4a453e">${escapeHtml(doc.notes)}</p>` : "",
    doc.terms
      ? `<p style="margin:12px 0 0;font-size:12px;color:#7a736a">${escapeHtml(doc.terms)}</p>`
      : "",
  ].join("");

  return `<div style="font-family:'Segoe UI',system-ui,sans-serif;background:#faf8f5;padding:24px;color:#231f1a">
  <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e8e5e0;border-radius:12px;overflow:hidden">
    <div style="padding:20px 24px;border-bottom:1px solid #e8e5e0">
      <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#7a736a">${TITLE[doc.kind]}</div>
      <div style="font-size:22px;font-weight:700;margin-top:2px">${escapeHtml(doc.number)}</div>
      <div style="font-size:13px;color:#7a736a;margin-top:6px">
        ${escapeHtml(doc.agencyName)}${doc.agencyPhone ? ` · ${escapeHtml(doc.agencyPhone)}` : ""}${
          doc.agencyEmail ? ` · ${escapeHtml(doc.agencyEmail)}` : ""
        }
      </div>
    </div>

    <div style="padding:20px 24px;border-bottom:1px solid #e8e5e0;font-size:14px">
      <div style="color:#7a736a;font-size:12px">Prepared for</div>
      <div style="font-weight:600;margin-top:2px">${escapeHtml(doc.clientName)}</div>
      ${contact ? `<div style="color:#7a736a;font-size:13px;margin-top:2px">${contact}</div>` : ""}
      <div style="color:#7a736a;font-size:13px;margin-top:8px">
        Issued ${escapeHtml(doc.issueDate)}${
          doc.validUntil ? ` · valid until ${escapeHtml(doc.validUntil)}` : ""
        }
      </div>
    </div>

    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr>
          <th style="${cell};text-align:left;font-size:12px;color:#7a736a;font-weight:600">Item</th>
          <th style="${right};font-size:12px;color:#7a736a;font-weight:600">Qty</th>
          <th style="${right};font-size:12px;color:#7a736a;font-weight:600">Rate</th>
          <th style="${right};font-size:12px;color:#7a736a;font-weight:600">Amount</th>
        </tr>
      </thead>
      <tbody>${lines}</tbody>
      <tfoot>
        ${totalRow("Subtotal", money(doc.totals.subtotal))}
        ${optional}
        ${doc.totals.paid > 0 ? "" : totalRow("Total", money(doc.totals.total), true)}
      </tfoot>
    </table>

    <div style="padding:16px 24px">${footer}</div>
  </div>
</div>`;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
