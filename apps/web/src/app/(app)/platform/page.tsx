"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, bdt, dmy } from "@/lib/api";
import { Card, Empty, Spinner, Th, Td } from "@/components/ui";
import { Button as Btn } from "@/components/ui";
import { Building2, Users, RefreshCw, ChevronLeft, ChevronRight, Ban, CheckCircle2, CreditCard, Wallet } from "lucide-react";

interface Overview {
  resorts: { total: number; active: number; suspended: number };
  agents: { total: number; pending: number; active: number; suspended: number };
  subscriptions: { trial: number; active: number; pastDue: number; cancelled: number; mrr: number };
  duesOutstanding: number;
  rooms: number;
}
interface ResortRow {
  id: number;
  name: string;
  location: string | null;
  status: string;
  createdAt: string;
  tenant: { name: string; plan: string };
  _count: { rooms: number; bookings: number; guests: number };
  subscriptions: { id: string; plan: string; status: string; monthlyFee: string; renewsAt: string | null }[];
}
interface AgentRow {
  id: number;
  name: string;
  phone: string;
  status: string;
  bookings: number;
  resorts: { id: number; name: string }[];
  wallet: { balance: number; active: boolean } | null;
}
interface DueRow {
  id: string;
  resortId: number;
  resort: { name: string };
  subscription: { plan: string };
  amount: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  status: string;
  paidAt: string | null;
}
interface CalCell {
  date: string;
  dues: number;
  dueCount: number;
  renewals: number;
}

const TABS = ["Overview", "Resorts", "Agents", "Subscriptions", "Dues", "Calendar"] as const;

export default function PlatformPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [ov, setOv] = useState<Overview | null>(null);
  const [resorts, setResorts] = useState<ResortRow[] | null>(null);
  const [agents, setAgents] = useState<AgentRow[] | null>(null);
  const [dues, setDues] = useState<DueRow[] | null>(null);
  const [cal, setCal] = useState<CalCell[] | null>(null);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [subFor, setSubFor] = useState<ResortRow | null>(null);
  const [subPlan, setSubPlan] = useState("GROWTH");
  const [subFee, setSubFee] = useState("5000");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const loadAll = useCallback(async () => {
    setErr("");
    const [o, r, a, d] = await Promise.all([
      api<Overview>("/platform/overview").catch(() => null),
      api<ResortRow[]>("/platform/resorts").catch(() => null),
      api<AgentRow[]>("/platform/agents").catch(() => null),
      api<DueRow[]>("/platform/dues").catch(() => null),
    ]);
    setOv(o);
    setResorts(r);
    setAgents(a);
    setDues(d);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const loadCal = useCallback(async () => {
    const [y, m] = month.split("-").map(Number);
    const from = `${month}-01`;
    const to = new Date(y!, m!, 0).toISOString().slice(0, 10);
    setCal(await api<CalCell[]>(`/platform/sub-calendar?from=${from}&to=${to}`).catch(() => []));
  }, [month]);

  useEffect(() => {
    if (tab === "Calendar") loadCal();
  }, [tab, loadCal]);

  async function act(fn: () => Promise<unknown>, reload = true) {
    setBusy(true);
    setErr("");
    try {
      await fn();
      if (reload) await loadAll();
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  }

  function shiftMonth(delta: number) {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y!, m! - 1 + delta, 1);
    setMonth(d.toISOString().slice(0, 7));
  }

  if (ov === null && resorts === null) return <Spinner />;

  const sub = (r: ResortRow) => r.subscriptions[0];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Platform</h1>
          <p className="text-sm text-slate-500">Super admin — all resorts, agents, subscriptions & dues</p>
        </div>
        <Btn onClick={() => loadAll()} disabled={busy}>
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Refresh
        </Btn>
      </div>

      {err && <div className="mt-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{err}</div>}

      <div className="mt-4 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition ${tab === t ? "bg-white text-brand-700 shadow" : "text-slate-500 hover:text-slate-800"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── overview ── */}
      {tab === "Overview" && ov && (
        <div className="mt-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={Building2} label="Resorts" value={`${ov.resorts.active}/${ov.resorts.total}`} sub={`${ov.resorts.suspended} suspended`} />
            <StatCard icon={Users} label="Agents" value={String(ov.agents.total)} sub={`${ov.agents.pending} pending · ${ov.agents.active} active`} />
            <StatCard icon={Wallet} label="MRR" value={bdt(ov.subscriptions.mrr)} sub={`${ov.subscriptions.active} active · ${ov.subscriptions.trial} trial`} />
            <StatCard icon={CreditCard} label="Dues outstanding" value={bdt(ov.duesOutstanding)} sub={`${ov.subscriptions.pastDue} past-due subs`} />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card className="p-5">
              <div className="text-sm font-bold">Subscription funnel</div>
              <div className="mt-3 space-y-2.5 text-sm">
                {[
                  { l: "Trial", v: ov.subscriptions.trial, c: "bg-slate-400" },
                  { l: "Active", v: ov.subscriptions.active, c: "bg-emerald-500" },
                  { l: "Past due", v: ov.subscriptions.pastDue, c: "bg-amber-500" },
                  { l: "Cancelled", v: ov.subscriptions.cancelled, c: "bg-red-400" },
                ].map((s) => (
                  <div key={s.l} className="flex items-center gap-3">
                    <div className="w-20 text-xs text-slate-500">{s.l}</div>
                    <div className="h-2 flex-1 rounded-full bg-slate-100">
                      <div className={`h-2 rounded-full ${s.c}`} style={{ width: `${Math.min(100, (s.v / Math.max(1, ov.subscriptions.active + ov.subscriptions.trial + ov.subscriptions.pastDue + ov.subscriptions.cancelled)) * 100)}%` }} />
                    </div>
                    <div className="w-6 text-right text-xs font-bold">{s.v}</div>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="p-5 lg:col-span-2">
              <div className="text-sm font-bold">Quick actions</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Btn variant="ghost" onClick={() => setTab("Resorts")}>Assign subscriptions</Btn>
                <Btn variant="ghost" onClick={() => setTab("Dues")}>Collect dues</Btn>
                <Btn variant="ghost" onClick={() => setTab("Agents")}>Review agents</Btn>
                <Btn variant="ghost" onClick={() => setTab("Calendar")}>Subscription calendar</Btn>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ── resorts ── */}
      {tab === "Resorts" && resorts && (
        <Card className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <Th>Resort</Th><Th>Plan</Th><Th>Status</Th><Th>Rooms</Th><Th>Bookings</Th><Th>Renews</Th><Th />
              </tr>
            </thead>
            <tbody>
              {resorts.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <Td>
                    <div className="font-semibold text-slate-800">{r.name}</div>
                    <div className="text-xs text-slate-400">{r.location ?? "—"} · tenant {r.tenant.name}</div>
                  </Td>
                  <Td>{sub(r) ? <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700">{sub(r)!.plan}</span> : <span className="text-xs text-slate-400">no subscription</span>}</Td>
                  <Td>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${r.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{r.status}</span>
                  </Td>
                  <Td>{r._count.rooms}</Td>
                  <Td>{r._count.bookings}</Td>
                  <Td>{sub(r)?.renewsAt ? dmy(sub(r)!.renewsAt) : "—"}</Td>
                  <Td>
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => { setSubFor(r); setSubPlan("GROWTH"); setSubFee("5000"); }}
                        className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Subscribe
                      </button>
                      {sub(r) && (
                        <>
                          <button
                            onClick={() => act(() => api(`/platform/subscriptions/${sub(r)!.id ?? ""}/renew`, { method: "POST", body: { months: 1 } }))}
                            className="rounded-lg border border-brand-300 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                          >
                            Renew
                          </button>
                          <button
                            onClick={() => act(() => api(`/platform/subscriptions/${sub(r)!.id}/cancel`, { method: "POST" }))}
                            className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => act(() => api(`/platform/resorts/${r.id}/status`, { method: "PATCH", body: { status: r.status === "active" ? "suspended" : "active" } }))}
                        className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        {r.status === "active" ? "Suspend" : "Activate"}
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          {resorts.length === 0 && <Empty msg="No resorts yet" />}
        </Card>
      )}

      {/* ── agents ── */}
      {tab === "Agents" && agents && (
        <Card className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr><Th>Agent</Th><Th>Resorts</Th><Th>Bookings</Th><Th>Wallet</Th><Th>Status</Th><Th /></tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.id} className="border-t border-slate-100">
                  <Td>
                    <div className="font-semibold text-slate-800">{a.name}</div>
                    <div className="text-xs text-slate-400">{a.phone}</div>
                  </Td>
                  <Td className="text-xs text-slate-500">{a.resorts.map((r) => r.name).join(", ") || "—"}</Td>
                  <Td>{a.bookings}</Td>
                  <Td>{a.wallet ? <span className={a.wallet.active ? "text-emerald-700" : "text-slate-400"}>{bdt(a.wallet.balance)}</span> : "—"}</Td>
                  <Td>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${a.status === "active" ? "bg-emerald-50 text-emerald-700" : a.status === "pending" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>{a.status}</span>
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-1.5">
                      {a.resorts[0] && a.status !== "active" && (
                        <button onClick={() => act(() => api(`/resorts/${a.resorts[0]!.id}/agents/${a.id}/status`, { method: "PATCH", body: { status: "active" } }))} className="rounded-lg border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
                          <CheckCircle2 className="inline h-3.5 w-3.5" /> Activate
                        </button>
                      )}
                      {a.resorts[0] && a.status === "active" && (
                        <button onClick={() => act(() => api(`/resorts/${a.resorts[0]!.id}/agents/${a.id}/status`, { method: "PATCH", body: { status: "suspended" } }))} className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">
                          <Ban className="inline h-3.5 w-3.5" /> Suspend
                        </button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          {agents.length === 0 && <Empty msg="No agents yet" />}
        </Card>
      )}

      {/* ── subscriptions calendar ── */}
      {tab === "Calendar" && (
        <div className="mt-5">
          <div className="mb-3 flex items-center gap-3">
            <button onClick={() => shiftMonth(-1)} className="rounded-lg border border-slate-300 p-2 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" /></button>
            <div className="text-lg font-bold">{month}</div>
            <button onClick={() => shiftMonth(1)} className="rounded-lg border border-slate-300 p-2 hover:bg-slate-50"><ChevronRight className="h-4 w-4" /></button>
            <span className="text-xs text-slate-400">subscription renewals & dues by date</span>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="p-1 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">{d}</div>
            ))}
            {cal && (() => {
              const [y, m] = month.split("-").map(Number);
              const first = new Date(y!, m! - 1, 1).getDay();
              const days = new Date(y!, m!, 0).getDate();
              const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
              const byDay = new Map(cal.map((c) => [Number(c.date.slice(8)), c]));
              return cells.map((day, i) => {
                const c = day ? byDay.get(day) : undefined;
                return (
                  <div key={i} className={`min-h-20 rounded-lg border p-1.5 text-xs ${c ? "border-emerald-300 bg-emerald-50/50" : "border-slate-100 bg-white"}`}>
                    {day && <div className="font-bold text-slate-600">{day}</div>}
                    {c && (
                      <div className="mt-0.5 space-y-0.5">
                        {c.dueCount > 0 && <div className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-800">{c.dueCount} due · {bdt(c.dues)}</div>}
                        {c.renewals > 0 && <div className="rounded bg-sky-100 px-1 py-0.5 text-[10px] font-semibold text-sky-800">{c.renewals} renewal</div>}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
          {cal?.length === 0 && <div className="mt-3 text-center text-sm text-slate-400">Nothing this month</div>}
        </div>
      )}

      {/* ── dues ── */}
      {tab === "Dues" && dues && (
        <Card className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr><Th>Resort</Th><Th>Plan</Th><Th>Period</Th><Th>Due date</Th><Th className="text-right">Amount</Th><Th>Status</Th><Th /></tr>
            </thead>
            <tbody>
              {dues.map((d) => (
                <tr key={d.id} className="border-t border-slate-100">
                  <Td className="font-semibold text-slate-800">{d.resort.name}</Td>
                  <Td>{d.subscription.plan}</Td>
                  <Td className="text-xs text-slate-500">{dmy(d.periodStart)} → {dmy(d.periodEnd)}</Td>
                  <Td>{dmy(d.dueDate)}</Td>
                  <Td className="text-right font-bold">{bdt(d.amount)}</Td>
                  <Td>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${d.status === "PAID" ? "bg-emerald-50 text-emerald-700" : d.status === "OVERDUE" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{d.status}</span>
                  </Td>
                  <Td>
                    {d.status !== "PAID" && (
                      <button onClick={() => act(() => api(`/platform/dues/${d.id}/pay`, { method: "POST", body: { method: "CASH" } }))} className="rounded-lg border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
                        Mark paid
                      </button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          {dues.length === 0 && <Empty msg="No dues — every resort is square" />}
        </Card>
      )}

      {/* ── subscribe modal ── */}
      {subFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setSubFor(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <div className="p-6">
            <div className="text-lg font-bold">Subscribe {subFor.name}</div>
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-semibold text-slate-500">Plan</label>
              <select value={subPlan} onChange={(e) => { setSubPlan(e.target.value); const fees: Record<string, string> = { STARTER: "2500", GROWTH: "5000", CHAIN: "12000" }; setSubFee(fees[e.target.value] ?? "5000"); }} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                <option>STARTER</option>
                <option>GROWTH</option>
                <option>CHAIN</option>
              </select>
              <label className="block text-xs font-semibold text-slate-500">Monthly fee (৳)</label>
              <input value={subFee} onChange={(e) => setSubFee(e.target.value)} type="number" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
              <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">Starts with a 14-day trial, first due generated on renewal.</div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setSubFor(null)}>Cancel</Btn>
              <Btn
                disabled={busy}
                onClick={() => act(async () => { await api(`/platform/resorts/${subFor.id}/subscription`, { method: "POST", body: { plan: subPlan, monthlyFee: Number(subFee) } }); setSubFor(null); })}
              >
                Start subscription
              </Btn>
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub }: { icon: typeof Building2; label: string; value: string; sub: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</div>
        <Icon className="h-5 w-5 text-brand-500" />
      </div>
      <div className="mt-2 text-2xl font-black text-slate-900">{value}</div>
      <div className="mt-0.5 text-xs text-slate-400">{sub}</div>
    </Card>
  );
}
