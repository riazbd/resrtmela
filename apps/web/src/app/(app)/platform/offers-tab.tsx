"use client";

import { useCallback, useEffect, useState } from "react";
import { Table } from "@/components/patterns";
import { api } from "@/lib/api";

interface OfferRow {
  id: number;
  code: string;
  audience: "RESORT" | "AGENCY";
  plan: string;
  trialDays: number | null;
  discountPct: number | null;
  note: string | null;
  email: string | null;
  expiresAt: string | null;
  maxUses: number;
  uses: number;
  signups: number;
  createdAt: string;
}

interface PlanRow {
  name: string;
  label: string;
  audience: "RESORT" | "AGENCY";
}

const BLANK = { audience: "RESORT" as "RESORT" | "AGENCY", plan: "", trialDays: "", discountPct: "", maxUses: "100", expiresAt: "", email: "", note: "" };

/**
 * Offers: the platform's invitations and campaigns (2026-09-11 design, §7).
 *
 * Each row is a link to hand out and a count of who came through it — the
 * first answer the platform has had to "which channel brought this customer".
 */
export function OffersTab() {
  const [rows, setRows] = useState<OfferRow[] | null>(null);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const load = useCallback(() => {
    api<OfferRow[]>("/platform/offers")
      .then((r) => { setRows(r); setErr(null); })
      .catch((e) => setErr((e as Error).message));
  }, []);
  useEffect(() => {
    load();
    api<PlanRow[]>("/platform/plans").then(setPlans).catch(() => setPlans([]));
  }, [load]);

  const shelf = plans.filter((p) => (p.audience ?? "RESORT") === form.audience);
  const num = (s: string) => (s.trim() === "" ? undefined : Number(s));

  async function create() {
    setBusy(true);
    setErr(null);
    try {
      await api("/platform/offers", {
        method: "POST",
        body: {
          audience: form.audience,
          plan: form.plan || shelf[0]?.name,
          trialDays: num(form.trialDays),
          discountPct: num(form.discountPct),
          maxUses: num(form.maxUses),
          expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59`).toISOString() : undefined,
          email: form.email.trim() || undefined,
          note: form.note.trim() || undefined,
        },
      });
      setForm({ ...BLANK, audience: form.audience });
      load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const link = (o: OfferRow) => `${origin}/signup${o.audience === "AGENCY" ? "/agency" : ""}?offer=${o.code}`;
  const input = "w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm";

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-bold text-slate-800">Offers — {rows?.length ?? 0}</h2>
        {err && <p className="mb-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">{err}</p>}
        {rows === null ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-slate-400">No offers yet. Make one to hand out a signup link with its own plan and trial.</p>
        ) : (
          <Table minWidth={0} tableClassName="text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="py-1 pr-3">Link</th>
                  <th className="py-1 pr-3">Lands on</th>
                  <th className="py-1 pr-3">Uses</th>
                  <th className="py-1 pr-3">Signups</th>
                  <th className="py-1">Expires</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id} className="border-t border-slate-100 align-top">
                    <td className="py-2 pr-3">
                      <div className="font-mono text-xs font-semibold text-slate-800">{o.code}</div>
                      <button
                        onClick={() => void navigator.clipboard?.writeText(link(o))}
                        className="text-[11px] text-brand-700 hover:underline"
                      >
                        copy link
                      </button>
                      <div className="text-[11px] text-slate-400">{o.note ?? ""}{o.email ? ` · for ${o.email}` : ""}</div>
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      {o.audience === "AGENCY" ? "Agency" : "Resort"} · {o.plan}
                      {o.trialDays != null ? ` · ${o.trialDays} days free` : ""}
                      {o.discountPct ? ` · ${o.discountPct}% off` : ""}
                    </td>
                    <td className="py-2 pr-3 text-xs">{o.uses} / {o.maxUses}</td>
                    <td className="py-2 pr-3 text-xs font-semibold">{o.signups}</td>
                    <td className="py-2 text-xs text-slate-500">{o.expiresAt ? new Date(o.expiresAt).toLocaleDateString("en-GB") : "never"}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
        )}
      </section>

      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-bold text-slate-800">New offer</h2>
        <label className="block text-xs text-slate-600">For
          <select className={input} value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value as "RESORT" | "AGENCY", plan: "" })}>
            <option value="RESORT">Resorts</option>
            <option value="AGENCY">Agencies</option>
          </select>
        </label>
        <label className="block text-xs text-slate-600">Plan it lands on
          <select className={input} value={form.plan || shelf[0]?.name || ""} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
            {shelf.map((p) => <option key={p.name} value={p.name}>{p.label} ({p.name})</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs text-slate-600">Trial days
            <input className={input} inputMode="numeric" placeholder="plan's own" value={form.trialDays} onChange={(e) => setForm({ ...form, trialDays: e.target.value })} />
          </label>
          <label className="block text-xs text-slate-600">Discount %
            <input className={input} inputMode="numeric" placeholder="none" value={form.discountPct} onChange={(e) => setForm({ ...form, discountPct: e.target.value })} />
          </label>
          <label className="block text-xs text-slate-600">Uses
            <input className={input} inputMode="numeric" value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} />
          </label>
          <label className="block text-xs text-slate-600">Expires
            <input className={input} type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
          </label>
        </div>
        <label className="block text-xs text-slate-600">Only for this email (optional)
          <input className={input} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <label className="block text-xs text-slate-600">Note (optional)
          <input className={input} placeholder="e.g. Facebook campaign, Sept" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </label>
        <button
          onClick={() => void create()}
          disabled={busy || shelf.length === 0}
          className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {busy ? "Making…" : "Make offer"}
        </button>
        {shelf.length === 0 && <p className="text-[11px] text-slate-400">No {form.audience === "AGENCY" ? "agency" : "resort"} plan exists yet.</p>}
      </section>
    </div>
  );
}
