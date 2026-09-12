"use client";

import { useCallback, useEffect, useState } from "react";
import { Table } from "@/components/patterns";
import { api } from "@/lib/api";
import { displayEmail, displayPhone } from "@/lib/contact";

interface AgencyRow {
  id: number;
  name: string;
  status: string;
  suspendedReason: string | null;
  createdAt: string;
  owner: { id: number; name: string; email: string; phone: string } | null;
  subscription: { plan: string; status: string; trialEndsAt: string | null } | null;
}

/**
 * The agencies waiting for the platform.
 *
 * Verification is now the only gate between an agency and every open resort
 * (2026-09-11 design, §6.2), so it sits where the platform owner will see it:
 * one row per agency, verified once — not once per resort.
 */
export function AgencyQueue() {
  const [rows, setRows] = useState<AgencyRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api<AgencyRow[]>("/platform/agencies")
      .then((r) => { setRows(r); setErr(null); })
      .catch((e) => setErr((e as Error).message));
  }, []);
  useEffect(load, [load]);

  async function verify(id: number) {
    try {
      await api(`/platform/agencies/${id}/verify`, { method: "POST" });
      load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  const pending = (rows ?? []).filter((r) => r.status === "pending");
  const others = (rows ?? []).filter((r) => r.status !== "pending");

  return (
    <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-800">Agencies — {pending.length} waiting for verification</h2>
        <span className="text-[11px] text-slate-400">{others.length} verified or suspended</span>
      </div>
      {err && <p className="mb-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">{err}</p>}
      {rows === null ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-slate-400">No agency accounts yet.</p>
      ) : (
        <Table minWidth={0} tableClassName="text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="py-1 pr-3">Agency</th>
                <th className="py-1 pr-3">Owner</th>
                <th className="py-1 pr-3">Plan</th>
                <th className="py-1 pr-3">Status</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {[...pending, ...others].map((a) => (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className="py-2 pr-3 font-semibold text-slate-800">{a.name}</td>
                  <td className="py-2 pr-3 text-xs text-slate-500">
                    <div>{a.owner?.name ?? "—"}</div>
                    <div>{a.owner ? displayEmail(a.owner.email) : ""}</div>
                    <div>{a.owner ? displayPhone(a.owner.phone) : ""}</div>
                  </td>
                  <td className="py-2 pr-3 text-xs">{a.subscription ? `${a.subscription.plan} · ${a.subscription.status}` : "none"}</td>
                  <td className="py-2 pr-3 text-xs">
                    {a.status}
                    {a.suspendedReason === "billing" ? " (unpaid bill)" : ""}
                  </td>
                  <td className="py-2 text-right">
                    {a.status === "pending" && (
                      <button
                        onClick={() => void verify(a.id)}
                        className="rounded-lg border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                      >
                        Verify
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
      )}
    </section>
  );
}
