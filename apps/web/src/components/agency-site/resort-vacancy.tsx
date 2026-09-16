"use client";

import { useState } from "react";
import { formatMoney, type AgencyResort, type PublishedVacancy } from "@rh/shared";
import { API_URL } from "@/lib/api-url";
import { enquiry, whatsappLink } from "./contact";

/**
 * What is free at one resort, and a message to the agency about it.
 *
 * A client component the page never waits for, like a resort's own widget. It
 * says how many and from what price, then hands the guest to the agency with
 * the dates already written into the message — that sentence is the booking.
 */
export function ResortVacancy({
  agency,
  resort,
  whatsapp,
  accent,
}: {
  agency: { slug: string; name: string };
  resort: AgencyResort;
  whatsapp: string | null;
  accent: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(tomorrow);
  const [rows, setRows] = useState<PublishedVacancy[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const nameOf = (key: string) => resort.roomTypes.find((t) => t.key === key)?.name ?? key;
  const money = (n: number) => formatMoney(n, { currency: resort.currency, locale: resort.locale, decimals: 0 });
  const lastDay = resort.bookableUntil;

  async function look() {
    setBusy(true);
    setProblem(null);
    try {
      const r = await fetch(
        `${API_URL}/site/agency/${encodeURIComponent(agency.slug)}/resorts/${encodeURIComponent(resort.slug)}/vacancy?from=${from}&to=${to}`,
      );
      if (!r.ok) throw new Error(String(r.status));
      setRows((await r.json()) as PublishedVacancy[]);
    } catch {
      setProblem(
        lastDay && to > lastDay
          ? `We can book this resort for stays ending by ${lastDay}. Message us about later dates.`
          : "We could not check just now — message us and we will.",
      );
      setRows(null);
    } finally {
      setBusy(false);
    }
  }

  const ask = whatsappLink(whatsapp, enquiry(agency.name, resort.name, { from, to }));

  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-medium text-slate-600">
          Arriving
          <input type="date" value={from} min={today} max={lastDay ?? undefined} onChange={(e) => setFrom(e.target.value)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900" />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Leaving
          <input type="date" value={to} min={from} max={lastDay ?? undefined} onChange={(e) => setTo(e.target.value)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900" />
        </label>
        <button
          onClick={() => void look()}
          disabled={busy || to <= from}
          className="rounded-lg px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: accent }}
        >
          {busy ? "Checking…" : "Is anything free?"}
        </button>
      </div>

      {problem && <p className="mt-2 text-xs text-slate-600">{problem}</p>}

      {rows && (
        <div className="mt-3 space-y-1">
          {rows.every((r) => r.free === 0) ? (
            <p className="text-sm text-slate-600">Nothing free for those nights — message us, we may find another way.</p>
          ) : (
            rows
              .filter((r) => r.free > 0)
              .map((r) => (
                <div key={r.key} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-slate-800">
                    <b className="font-semibold">{r.free}</b> {nameOf(r.key)}
                  </span>
                  {r.priceFrom != null && <span className="text-slate-500">from {money(r.priceFrom)} /night</span>}
                </div>
              ))
          )}
          {ask && (
            <a href={ask} target="_blank" rel="noopener noreferrer nofollow" className="mt-2 inline-block text-sm font-semibold underline underline-offset-4" style={{ color: accent }}>
              Ask us to hold it on WhatsApp
            </a>
          )}
        </div>
      )}
    </div>
  );
}
