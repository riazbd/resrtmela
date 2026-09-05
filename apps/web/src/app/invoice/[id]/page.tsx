"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, bdt, dmy } from "@/lib/api";
import { Spinner } from "@/components/ui";

interface InvoiceData {
  invoiceNo: string;
  issuedAt: string;
  resort: {
    name: string; location: string | null; address: string | null;
    phone: string | null; website: string | null;
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
}

/** Bilingual (BN/EN) hotel invoice — print-ready A5/A4. */
export default function InvoicePage() {
  const params = useParams<{ id: string }>();
  const [inv, setInv] = useState<InvoiceData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<InvoiceData>(`/bookings/${params.id}/invoice`)
      .then(setInv)
      .catch((e) => setErr((e as Error).message));
  }, [params.id]);

  if (err) return <div className="p-10 text-center text-sm text-red-600">{err}</div>;
  if (!inv) return <Spinner />;

  const stay =
    `${dmy(inv.booking.checkIn)} — ${dmy(inv.booking.checkOut)}`;

  return (
    <main className="mx-auto max-w-2xl bg-white p-10 print:p-0">
      {/* header */}
      <div className="flex items-start justify-between border-b-2 border-brand-700 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{inv.resort.name}</h1>
          <p className="text-sm text-slate-600" lang="bn">রিসোর্টহাব — আপনার অবস্থানের রসিদ</p>
          <p className="mt-1 text-xs text-slate-500">
            {inv.resort.location}
            {inv.resort.address ? ` · ${inv.resort.address}` : ""}
          </p>
          <p className="text-xs text-slate-500">
            {[inv.resort.phone, inv.resort.website].filter(Boolean).join(" · ")}
          </p>
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
              <td className="py-2 text-right">{bdt(it.unitPrice)}</td>
              <td className="py-2 text-right font-medium">{bdt(it.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* totals */}
      <div className="ml-auto mt-4 w-72 space-y-1 text-sm">
        <Row en="Rent" bn="ভাড়া" value={bdt(inv.rent)} />
        {inv.discount > 0 && <Row en="Discount" bn="ছাড়" value={`− ${bdt(inv.discount)}`} />}
        {inv.paid > 0 && <Row en="Paid" bn="পরিশোধিত" value={`− ${bdt(inv.paid)}`} />}
        <div className="flex justify-between border-t-2 border-slate-800 pt-1 text-base font-bold">
          <span>
            Due · <span lang="bn">বাকি</span>
          </span>
          <span>{bdt(inv.due)}</span>
        </div>
      </div>

      {inv.payments.length > 0 && (
        <div className="mt-6 text-xs text-slate-500">
          <div className="font-semibold uppercase text-slate-400">
            Payments received · <span lang="bn">গৃহীত পেমেন্ট</span>
          </div>
          {inv.payments.map((p, i) => (
            <div key={i}>
              {dmy(p.date)} · {p.method} · {p.type} · {bdt(p.amount)}
              {p.receivedBy ? ` (by ${p.receivedBy})` : ""}
            </div>
          ))}
        </div>
      )}

      {inv.booking.remarks && (
        <p className="mt-4 text-xs italic text-slate-400">{inv.booking.remarks}</p>
      )}

      <p className="mt-8 border-t border-slate-200 pt-3 text-center text-[10px] text-slate-400" lang="bn">
        {inv.resort.name}-এ অবস্থানের জন্য ধন্যবাদ! · Thank you for staying with {inv.resort.name}! — Resort Mela
      </p>

      <div className="mt-4 text-center print:hidden">
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
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
