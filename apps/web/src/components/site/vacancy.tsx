"use client";

import { useState } from "react";
import type { PublishedResort, PublishedVacancy } from "@rh/shared";
import { API_URL } from "@/lib/api-url";
import { todayIn, addDaysIso, PLATFORM_TIMEZONE } from "@/lib/resort-dates";

/**
 * What is free between two dates — the one thing on this page that makes it
 * worth visiting rather than reading.
 *
 * It is a client component on purpose, and the page never waits for it: the
 * site renders and this fills in. A slow or failing lookup costs a widget, not
 * the resort's front page, which is the difference between a bad afternoon and
 * a business being invisible.
 *
 * It says how many and from what price, and then it stops. Booking is a phone
 * call: no basket, no hold, no payment, and no guest account to forget the
 * password to.
 */
export function Vacancy({ resort }: { resort: PublishedResort }) {
  // a visitor has no session and the payload carries no zone, so the
  // house zone decides — UTC would offer last night's rooms until six
  const today = todayIn(PLATFORM_TIMEZONE);
  const tomorrow = addDaysIso(today, 1);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(tomorrow);
  const [rows, setRows] = useState<PublishedVacancy[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const nameOf = (key: string) => resort.roomTypes.find((t) => t.key === key)?.name ?? key;
  const money = (n: number) =>
    new Intl.NumberFormat(resort.locale || "en-IN", {
      style: "currency",
      currency: resort.currency || "BDT",
      maximumFractionDigits: 0,
    }).format(n);

  async function look() {
    setBusy(true);
    setProblem(null);
    try {
      const r = await fetch(
        `${API_URL}/site/${encodeURIComponent(resort.slug)}/vacancy?from=${from}&to=${to}`,
      );
      if (!r.ok) throw new Error(await r.text());
      setRows((await r.json()) as PublishedVacancy[]);
    } catch {
      // the API's own sentence is not for a guest; one plain line is
      setProblem("We could not check just now — please call us.");
      setRows(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="vacancy" className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="text-sm font-semibold text-slate-900">Is anything free?</div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-slate-600">
          Arriving
          <input
            type="date"
            value={from}
            min={today}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
          />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Leaving
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
          />
        </label>
        <button
          onClick={() => void look()}
          disabled={busy || to <= from}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Checking…" : "Check"}
        </button>
      </div>

      {problem && <p className="mt-3 text-xs text-slate-500">{problem}</p>}

      {rows && (
        <div className="mt-4 space-y-1.5">
          {rows.every((r) => r.free === 0) ? (
            <p className="text-sm text-slate-600">
              Nothing free for those nights. Call us — plans change.
            </p>
          ) : (
            rows
              .filter((r) => r.free > 0)
              .map((r) => (
                <div key={r.key} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-slate-800">
                    <b className="font-semibold">{r.free}</b> {nameOf(r.key)}
                  </span>
                  {r.priceFrom != null && (
                    <span className="text-slate-500">from {money(r.priceFrom)} /night</span>
                  )}
                </div>
              ))
          )}
          <p className="pt-1 text-xs text-slate-400">
            To book, call or message us — we will hold it for you.
          </p>
        </div>
      )}
    </div>
  );
}
