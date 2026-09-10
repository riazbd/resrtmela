"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { api, money, dmy } from "@/lib/api";
import { Spinner } from "@/components/ui";
import { Download } from "lucide-react";

interface InvoiceData {
  invoiceNo: string;
  issuedAt: string;
  resort: {
    name: string; location: string | null; address: string | null;
    phone: string | null; website: string | null; binNumber?: string | null;
    checkInTime: string; checkOutTime: string;
  };
  booking: {
    code: string; state: string; checkIn: string | null; checkOut: string | null;
    nights: number; adults: number; children: number; remarks: string | null; agent: string | null;
  };
  guest: { fullName: string; phone: string; nidPassportNo: string | null };
  items: { description: string; nights: number | null; qty: number; unitPrice: number; amount: number }[];
  payments: { date: string; method: string; type: string; amount: number; receivedBy: string | null }[];
  rent: number; discount: number; paid: number; due: number;
  taxable: number; taxRatePct: number; tax: number; total: number;
  taxLines?: { code: string; label: string; ratePct: number; amount: number }[];
}

/** Bilingual (BN/EN) hotel invoice — print-ready A5/A4. */
export default function InvoicePage() {
  const params = useParams<{ id: string }>();
  const [inv, setInv] = useState<InvoiceData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const paper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<InvoiceData>(`/bookings/${params.id}/invoice`)
      .then(setInv)
      .catch((e) => setErr((e as Error).message));
  }, [params.id]);

  useEffect(() => {
    if (inv && typeof window !== "undefined" && window.location.search.includes("print=1")) {
      const t = setTimeout(() => window.print(), 600);
      return () => clearTimeout(t);
    }
  }, [inv]);

  async function downloadPdf() {
    if (!paper.current || !inv) return;
    setDownloading(true);
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);
      const canvas = await html2canvas(paper.current, { scale: 2, backgroundColor: "#ffffff" });
      const img = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const w = pw - 12;
      const h = (canvas.height * w) / canvas.width;
      let left = h;
      let pos = 6;
      pdf.addImage(img, "PNG", 6, pos, w, h);
      left -= ph - 12;
      while (left > 0) {
        pos = left - h + 6; // shift up for the next page
        pdf.addPage();
        pdf.addImage(img, "PNG", 6, pos, w, h);
        left -= ph - 12;
      }
      pdf.save(`invoice-${inv.invoiceNo || inv.booking.code}.pdf`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setDownloading(false);
    }
  }

  if (err) return <div className="p-10 text-center text-sm text-red-600">{err}</div>;
  if (!inv) return <Spinner />;

  const stay =
    `${dmy(inv.booking.checkIn)} — ${dmy(inv.booking.checkOut)}`;

  return (
    <main className="mx-auto max-w-2xl bg-white p-10 print:p-0" ref={paper}>
      {/* header */}
      <div className="flex items-start justify-between border-b-2 border-brand-700 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{inv.resort.name}</h1>
          {/* the platform's name has no business on a bill the resort hands
              its own guest — and this one was the *old* platform's name */}
          <p className="text-sm text-slate-600" lang="bn">আপনার অবস্থানের রসিদ</p>
          <p className="mt-1 text-xs text-slate-500">
            {inv.resort.location}
            {inv.resort.address ? ` · ${inv.resort.address}` : ""}
          </p>
          <p className="text-xs text-slate-500">
            {[inv.resort.phone, inv.resort.website].filter(Boolean).join(" · ")}
          </p>
          {/* a VAT invoice in Bangladesh has to show the seller's BIN */}
          {inv.resort.binNumber && (
            <p className="text-xs text-slate-500">
              BIN · <span lang="bn">বিআইএন</span> {inv.resort.binNumber}
            </p>
          )}
        </div>
        <div className="text-right">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Invoice · <span lang="bn">রসিদ</span>
          </div>
          <div className="text-lg font-bold text-brand-700">{inv.invoiceNo}</div>
          <div className="text-xs text-slate-400">{dmy(inv.issuedAt)}</div>
        </div>
      </div>

      {/* parties + stay */}
      <div className="grid grid-cols-3 gap-4 border-b border-slate-200 py-4 text-xs">
        <div>
          <div className="font-semibold text-slate-400">
            GUEST · <span lang="bn">অতিথি</span>
          </div>
          <div className="font-medium">{inv.guest.fullName}</div>
          <div>{inv.guest.phone}</div>
          {inv.guest.nidPassportNo && <div>ID: {inv.guest.nidPassportNo}</div>}
        </div>
        <div>
          <div className="font-semibold text-slate-400">
            STAY · <span lang="bn">অবস্থান</span>
          </div>
          <div>{stay}</div>
          <div>
            {inv.booking.nights} night(s) · <span lang="bn">রাত</span> · {inv.booking.adults}A{" "}
            {inv.booking.children}C
          </div>
        </div>
        <div>
          <div className="font-semibold text-slate-400">
            BOOKING · <span lang="bn">বুকিং</span>
          </div>
          <div>{inv.booking.code}</div>
          <div lang="bn">
            চেক-ইন {inv.resort.checkInTime} · চেক-আউট {inv.resort.checkOutTime}
          </div>
          <div className="text-slate-400">
            in {inv.resort.checkInTime} · out {inv.resort.checkOutTime}
          </div>
        </div>
      </div>

      {/* items */}
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-300 text-left text-[11px] uppercase text-slate-400">
            <th className="py-2">
              Description · <span lang="bn">বিবরণ</span>
            </th>
            <th className="py-2 text-center">Qty</th>
            <th className="py-2 text-right">Rate</th>
            <th className="py-2 text-right">
              Amount · <span lang="bn">টাকা</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {inv.items.map((it, i) => (
            <tr key={i} className="border-b border-slate-100">
              <td className="py-2">
                {it.description}
                {it.nights ? <span className="text-slate-400"> × {it.nights}n</span> : null}
              </td>
              <td className="py-2 text-center">{it.qty}</td>
              <td className="py-2 text-right">{money(it.unitPrice)}</td>
              <td className="py-2 text-right font-medium">{money(it.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* totals */}
      <div className="ml-auto mt-4 w-72 space-y-1 text-sm">
        <Row en="Rent" bn="ভাড়া" value={money(inv.rent)} />
        {inv.discount > 0 && <Row en="Discount" bn="ছাড়" value={`− ${money(inv.discount)}`} />}
        {inv.tax > 0 && (
          <>
            <Row en="Taxable amount" bn="করযোগ্য" value={money(inv.taxable)} />
            {/* one line per charge: a bill showing a single "Tax (15%)" cannot
                show a service charge and the VAT charged on top of it, which is
                how a hotel bill in this market actually reads */}
            {(inv.taxLines ?? []).map((l) => (
              <Row key={l.code} en={`${l.label} (${l.ratePct}%)`} bn={`${l.label} (${l.ratePct}%)`} value={money(l.amount)} />
            ))}
            <Row en="Total" bn="সর্বমোট" value={money(inv.total)} />
          </>
        )}
        {inv.paid > 0 && <Row en="Paid" bn="পরিশোধিত" value={`− ${money(inv.paid)}`} />}
        <div className="flex justify-between border-t-2 border-slate-800 pt-1 text-base font-bold">
          <span>
            Due · <span lang="bn">বাকি</span>
          </span>
          <span>{money(inv.due)}</span>
        </div>
      </div>

      {inv.payments.length > 0 && (
        <div className="mt-6 text-xs text-slate-500">
          <div className="font-semibold uppercase text-slate-400">
            Payments received · <span lang="bn">গৃহীত পেমেন্ট</span>
          </div>
          {inv.payments.map((p, i) => (
            <div key={i}>
              {dmy(p.date)} · {p.method} · {p.type} · {money(p.amount)}
              {p.receivedBy ? ` (by ${p.receivedBy})` : ""}
            </div>
          ))}
        </div>
      )}

      {inv.booking.remarks && (
        <p className="mt-4 text-xs italic text-slate-400">{inv.booking.remarks}</p>
      )}

      {/* The guest is a customer of the resort, not of the platform. The
          platform's name has no business on the bill they are handed. */}
      <p className="mt-8 border-t border-slate-200 pt-3 text-center text-[10px] text-slate-400" lang="bn">
        {inv.resort.name}-এ অবস্থানের জন্য ধন্যবাদ! · Thank you for staying with {inv.resort.name}!
        {[inv.resort.location, inv.resort.phone, inv.resort.website].filter(Boolean).length > 0 && (
          <span className="mt-1 block text-slate-300">
            {[inv.resort.location, inv.resort.phone, inv.resort.website].filter(Boolean).join(" · ")}
          </span>
        )}
      </p>

      <div className="mt-4 flex items-center justify-center gap-2 print:hidden">
        <button
          onClick={downloadPdf}
          disabled={downloading}
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {downloading ? "Preparing…" : "Download PDF"}
        </button>
        <button
          onClick={() => window.print()}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Print / Save PDF
        </button>
      </div>
    </main>
  );
}

function Row({ en, bn, value }: { en: string; bn: string; value: string }) {
  return (
    <div className="flex justify-between text-slate-600">
      <span>
        {en} · <span lang="bn">{bn}</span>
      </span>
      <span>{value}</span>
    </div>
  );
}
