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
  /** Ours, opened to try things with — badged here and out of Overview's figures. */
  demo: boolean;
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

  /**
   * Hold an agency, or let it back in.
   *
   * An agency *is* its account row — there are no resorts to suspend — so this
   * was the only customer the platform could not hold by hand, while the
   * billing sweep could hold it automatically. Which left the worse half: an
   * agency suspended in error had one way out, paying a bill it might not owe.
   *
   * Suspending asks for a reason because "suspended" with no why is a support
   * ticket nobody can answer.
   */
  async function setStatus(a: AgencyRow, status: "active" | "suspended") {
    if (status === "suspended") {
      const reason = window.prompt(`Suspend ${a.name}? Say why — it is shown to whoever asks later.`, "abuse");
      if (reason === null) return;
      try {
        await api(`/platform/accounts/${a.id}/status`, { method: "PATCH", body: { status, reason: reason.slice(0, 32) } });
        load();
      } catch (e) {
        setErr((e as Error).message);
      }
      return;
    }
    if (!window.confirm(`Let ${a.name} back in?`)) return;
    try {
      await api(`/platform/accounts/${a.id}/status`, { method: "PATCH", body: { status } });
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
                  <td className="py-2 pr-3 font-semibold text-slate-800">
                    <span>{a.name}</span>
                    {a.demo && (
                      <span
                        title="Opened by the platform to test with. Left out of the figures on Overview."
                        className="ml-1.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-700 ring-1 ring-amber-200"
                      >
                        demo
                      </span>
                    )}
                  </td>
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
                    {a.status !== "pending" && a.status !== "suspended" && (
                      <button
                        onClick={() => void setStatus(a, "suspended")}
                        className="mr-1.5 rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                      >
                        Suspend
                      </button>
                    )}
                    {a.status === "suspended" && (
                      <button
                        onClick={() => void setStatus(a, "active")}
                        className="mr-1.5 rounded-lg border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                      >
                        Let back in
                      </button>
                    )}
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
