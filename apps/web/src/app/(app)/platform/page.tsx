"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, money, dmy, type CmsRow, cur } from "@/lib/api";
import { useApi, keys, useQueryClient } from "@/lib/query";
import { Tabs } from "@/components/patterns";
import { useAuth } from "@/lib/auth";
import { Card, Empty, Spinner, Th, Td, useToast } from "@/components/ui";
import { Button as Btn } from "@/components/ui";
import { Building2, Users, RefreshCw, ChevronLeft, ChevronRight, Ban, CheckCircle2, CreditCard, Wallet, LogIn, Globe, Gauge, PlayCircle } from "lucide-react";
import { monthOf } from "@/lib/resort-dates";
import { ErrorState } from "@/components/error-state";

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
  userResorts?: { user: { id: number; name: string; phone: string } }[];
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
interface PlanDef {
  id: string;
  name: string;
  label: string;
  monthlyFee: string;
  maxRooms: number;
  maxResorts?: number;
  blurb: string | null;
  active: boolean;
  sortOrder: number;
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
interface CreditOrderRow {
  id: string;
  credits: number;
  price: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  note: string | null;
  createdAt: string;
  buyer: string;
  buyerContact: string;
  resortName: string;
}

/** A one-off amount a tenant owes, outside the subscription's monthly rhythm. */
interface ChargeRow {
  id: number;
  resort: { id: number; name: string };
  kind: string;
  description: string;
  amount: number;
  status: string;
  paidAt: string | null;
  createdAt: string;
}
interface CalCell {
  date: string;
  dues: number;
  dueCount: number;
  renewals: number;
}

const TABS = ["Overview", "Resorts", "Agents", "Plans", "Subscriptions", "Dues", "Email credits", "Calendar", "Billing policy", "Website CMS"] as const;

export default function PlatformPage() {
  const { impersonate, exitImpersonation, isImpersonating } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [subFor, setSubFor] = useState<ResortRow | null>(null);
  const [subPlan, setSubPlan] = useState("");
  const [subFee, setSubFee] = useState("5000");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // five independent reads: the overview lands first and the tables fill in
  // behind it, instead of every tab waiting on the slowest query
  const ovQ = useApi(keys.platform("overview"), () => api<Overview>("/platform/overview"));
  const resortsQ = useApi(keys.platform("resorts"), () => api<ResortRow[]>("/platform/resorts"));
  const agentsQ = useApi(keys.platform("agents"), () => api<AgentRow[]>("/platform/agents"));
  const duesQ = useApi(keys.platform("dues"), () => api<DueRow[]>("/platform/dues"));
  /**
   * One-off charges — an email credit pack today; SMS packs and setup fees will
   * be the same shape. They live beside the subscription dues rather than in
   * their own tab, because "what does this tenant owe" is one question.
   */
  const chargesQ = useApi(keys.platform("charges"), () => api<ChargeRow[]>("/platform/charges"));
  const plansQ = useApi(keys.platform("plans"), () => api<PlanDef[]>("/platform/plans"));
  /**
   * Email credit packs waiting on a decision.
   *
   * A pack used to be granted the moment a resort clicked it, raising a
   * billable charge nobody here had agreed to. Now it queues, and this is
   * where somebody says yes.
   */
  const creditOrdersQ = useApi(
    keys.platform("credit-orders"),
    () => api<CreditOrderRow[]>("/platform/email-credit-orders"),
  );

  const ov = ovQ.data ?? null;
  const resorts = resortsQ.data ?? null;
  const agents = agentsQ.data ?? null;
  const dues = duesQ.data ?? null;
  const plans = plansQ.data ?? null;
  const creditOrders = creditOrdersQ.data ?? null;

  const loadAll = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["platform"] });
  }, [qc]);

  async function savePlan(name: string, monthlyFee: number, maxRooms: number) {
    setBusy(true);
    setErr("");
    try {
      await api(`/platform/plans/${name}`, { method: "PATCH", body: { monthlyFee, maxRooms } });
      await loadAll();
      setErr("");
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  }

  const [calYear, calMonth] = month.split("-").map(Number);
  const calQ = useApi(
    keys.platform("sub-calendar", month),
    () =>
      api<CalCell[]>(
        `/platform/sub-calendar?from=${monthOf.firstDay(month)}&to=${monthOf.lastDay(month)}`,
      ),
    // only fetched once the tab is actually open
    { enabled: tab === "Calendar" },
  );
  const cal = calQ.data ?? null;

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

  async function loginAs(userId: number) {
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ accessToken: string }>(`/platform/users/${userId}/login-as`, { method: "POST", body: {} });
      await impersonate(r.accessToken);
    } catch (e) {
      setErr(String((e as Error).message ?? e));
      setBusy(false);
    }
  }

  function shiftMonth(delta: number) {
    // `new Date(y, m, 1).toISOString()` converts local midnight to the previous
    // day in any positive-offset browser, and so to the previous month: in Dhaka
    // the Next arrow returned the month it started from and appeared dead
    setMonth(monthOf(month, delta));
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

      <Tabs tabs={TABS} value={tab} onChange={setTab} className="mt-4" />

      {/* ── overview ── */}
      {tab === "Overview" && ov && (
        <div className="mt-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={Building2} label="Resorts" value={`${ov.resorts.active}/${ov.resorts.total}`} sub={`${ov.resorts.suspended} suspended`} />
            <StatCard icon={Users} label="Agents" value={String(ov.agents.total)} sub={`${ov.agents.pending} pending · ${ov.agents.active} active`} />
            <StatCard icon={Wallet} label="MRR" value={money(ov.subscriptions.mrr)} sub={`${ov.subscriptions.active} active · ${ov.subscriptions.trial} trial`} />
            <StatCard icon={CreditCard} label="Dues outstanding" value={money(ov.duesOutstanding)} sub={`${ov.subscriptions.pastDue} past-due subs`} />
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
                      {r.userResorts?.[0] && (
                        <button
                          onClick={() => loginAs(r.userResorts![0]!.user.id)}
                          title={`Log in as ${r.userResorts[0].user.name} (${r.userResorts[0].user.phone})`}
                          className="rounded-lg border border-brand-300 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                        >
                          <LogIn className="inline h-3.5 w-3.5" /> Login as
                        </button>
                      )}
                      <button
                        onClick={() => {
                          const first = (plansQ.data ?? []).find((pl) => pl.active);
                          setSubFor(r);
                          setSubPlan(first?.name ?? "");
                          setSubFee(first ? String(Number(first.monthlyFee)) : "");
                        }}
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
                  <Td>{a.wallet ? <span className={a.wallet.active ? "text-emerald-700" : "text-slate-400"}>{money(a.wallet.balance)}</span> : "—"}</Td>
                  <Td>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${a.status === "active" ? "bg-emerald-50 text-emerald-700" : a.status === "pending" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>{a.status}</span>
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => loginAs(a.id)}
                        title={`Log in as ${a.name}`}
                        className="rounded-lg border border-brand-300 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                      >
                        <LogIn className="inline h-3.5 w-3.5" /> Login as
                      </button>
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

      {/* ── plans ── */}
      {tab === "Plans" && plans && (
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {plans.map((p) => (
            <PlanCard key={p.name} plan={p} busy={busy} onSave={savePlan} />
          ))}
          <div className="md:col-span-3">
            <Card className="p-4">
              <div className="text-sm font-bold">How plan billing works</div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-500">
                <li>Assign a plan per resort in the <b>Resorts</b> tab — every subscription starts with a 14-day free trial.</li>
                <li><b>Renew</b> generates the next period&apos;s due (fee × months) and extends the renewal date.</li>
                <li>Collect the money in the <b>Dues</b> tab — marking paid keeps the subscription <b>Active</b>.</li>
                <li>Fee edits here apply to <b>new subscriptions</b>; existing ones keep their fee until you renew them manually with the new amount in mind.</li>
              </ul>
            </Card>
          </div>
        </div>
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
                        {c.dueCount > 0 && <div className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-800">{c.dueCount} due · {money(c.dues)}</div>}
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
                  <Td className="text-right font-bold">{money(d.amount)}</Td>
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

      {tab === "Dues" && (
        <Card className="mt-5 overflow-x-auto">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="text-sm font-bold text-slate-800">One-off charges</h3>
            <span className="text-xs text-slate-400">
              Credit packs and the like. The credits arrive at once; the money is collected here.
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr><Th>Resort</Th><Th>What for</Th><Th>Raised</Th><Th className="text-right">Amount</Th><Th>Status</Th><Th /></tr>
            </thead>
            <tbody>
              {(chargesQ.data ?? []).map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <Td className="font-semibold text-slate-800">{c.resort.name}</Td>
                  <Td>{c.description}</Td>
                  <Td className="text-xs text-slate-500">{dmy(c.createdAt)}</Td>
                  <Td className="text-right font-bold">{money(c.amount)}</Td>
                  <Td>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${c.status === "PAID" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{c.status}</span>
                  </Td>
                  <Td>
                    {c.status !== "PAID" && (
                      <button onClick={() => act(() => api(`/platform/charges/${c.id}/pay`, { method: "POST", body: { method: "CASH" } }))} className="rounded-lg border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
                        Mark paid
                      </button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          {(chargesQ.data ?? []).length === 0 && <Empty msg="No one-off charges outstanding" />}
        </Card>
      )}

      {/* ── website CMS ── */}
      {tab === "Email credits" && (
        <Card
          title={`Email credit requests (${(creditOrders ?? []).filter((o) => o.status === "PENDING").length} waiting)`}
          className="!p-0"
        >
          {creditOrdersQ.error ? (
            <div className="p-4"><ErrorState error={creditOrdersQ.error} reset={() => void creditOrdersQ.refetch()} /></div>
          ) : (creditOrders ?? []).length === 0 ? (
            <div className="p-4 text-sm text-slate-400">No requests yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr><Th>Requested</Th><Th>Resort</Th><Th>Who</Th><Th className="text-right">Credits</Th><Th className="text-right">Price</Th><Th>Status</Th><Th /></tr>
                </thead>
                <tbody>
                  {(creditOrders ?? []).map((o) => (
                    <tr key={o.id} className="border-t border-slate-100">
                      <Td className="text-xs text-slate-400">{new Date(o.createdAt).toLocaleDateString("en-GB")}</Td>
                      <Td className="font-medium">{o.resortName}</Td>
                      <Td className="text-xs">
                        <div>{o.buyer}</div>
                        <div className="text-slate-400">{o.buyerContact}</div>
                      </Td>
                      <Td className="text-right tabular-nums">{o.credits.toLocaleString("en-IN")}</Td>
                      <Td className="text-right tabular-nums font-semibold">{money(o.price)}</Td>
                      <Td>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${o.status === "APPROVED" ? "bg-emerald-50 text-emerald-700" : o.status === "REJECTED" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"}`}>
                          {o.status}
                        </span>
                        {o.note && <div className="text-[11px] text-slate-400">{o.note}</div>}
                      </Td>
                      <Td>
                        {o.status === "PENDING" && (
                          <div className="flex justify-end gap-1.5">
                            <Btn
                              disabled={busy}
                              onClick={() => {
                                if (!window.confirm(`Approve ${o.credits.toLocaleString("en-IN")} credits for ${o.resortName}? ${money(o.price)} is charged to their platform bill.`)) return;
                                void act(() => api(`/platform/email-credit-orders/${o.id}/decision`, { method: "POST", body: { decision: "APPROVE" } }));
                              }}
                            >
                              Approve
                            </Btn>
                            <Btn
                              variant="ghost"
                              disabled={busy}
                              onClick={() => {
                                const note = window.prompt(`Decline ${o.credits.toLocaleString("en-IN")} credits for ${o.resortName}. Reason (they will see it):`);
                                if (note === null) return;
                                void act(() => api(`/platform/email-credit-orders/${o.id}/decision`, { method: "POST", body: { decision: "REJECT", note: note || undefined } }));
                              }}
                            >
                              Decline
                            </Btn>
                          </div>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === "Billing policy" && <PolicyTab />}
      {tab === "Website CMS" && <CmsTab />}

      {/* ── subscribe modal ── */}
      {subFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setSubFor(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <div className="p-6">
            <div className="text-lg font-bold">Subscribe {subFor.name}</div>
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-semibold text-slate-500">Plan</label>
              {/* the plans were already fetched into `plansQ` above and this
                  carried its own copy of the names and the prices, so editing a
                  fee in the Plans tab changed nothing here */}
              <select
                value={subPlan}
                onChange={(e) => {
                  setSubPlan(e.target.value);
                  const chosen = (plansQ.data ?? []).find((pl) => pl.name === e.target.value);
                  if (chosen) setSubFee(String(Number(chosen.monthlyFee)));
                }}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                {(plansQ.data ?? []).filter((pl) => pl.active).map((pl) => (
                  <option key={pl.name} value={pl.name}>{pl.label} · {pl.name}</option>
                ))}
              </select>
              <label className="block text-xs font-semibold text-slate-500">Monthly fee ({cur()})</label>
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

function PlanCard({ plan, busy, onSave }: { plan: PlanDef; busy: boolean; onSave: (name: string, fee: number, rooms: number) => void }) {
  const [fee, setFee] = useState(String(Number(plan.monthlyFee)));
  const [rooms, setRooms] = useState(String(plan.maxRooms));
  const dirty = Number(fee) !== Number(plan.monthlyFee) || Number(rooms) !== plan.maxRooms;
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div className="text-lg font-bold text-slate-900">{plan.label}</div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${plan.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>{plan.active ? "active" : "hidden"}</span>
      </div>
      <div className="mt-0.5 text-xs text-slate-400">{plan.blurb}</div>
      {plan.maxResorts != null && plan.maxResorts > 1 && (
        <div className="mt-1 text-[11px] font-semibold text-brand-600">up to {plan.maxResorts} resorts per owner</div>
      )}
      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="text-xs font-semibold text-slate-500">Monthly fee ({cur()})</span>
          <input type="number" min={0} value={fee} onChange={(e) => setFee(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-500">Max rooms per resort</span>
          <input type="number" min={1} value={rooms} onChange={(e) => setRooms(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <button
          disabled={!dirty || busy}
          onClick={() => onSave(plan.name, Number(fee), Number(rooms))}
          className="w-full rounded-lg bg-brand-600 py-2 text-sm font-bold text-white transition hover:bg-brand-700 disabled:opacity-40"
        >
          {busy ? "Saving…" : dirty ? "Save changes" : "Saved"}
        </button>
      </div>
    </Card>
  );
}

const CMS_FIELDS: { key: string; label: string; hint?: string }[] = [
  { key: "hero.title", label: "Hero title", hint: "big headline on the homepage" },
  { key: "hero.subtitle", label: "Hero subtitle", hint: "one line under the title" },
  { key: "hero.cta", label: "Hero button text" },
  { key: "hero.badge", label: "Hero badge", hint: "small pill above the title" },
  { key: "stats.1.value", label: "Figure 1", hint: "the four figures under the hero — keep them to claims you can show are true" },
  { key: "stats.1.label", label: "Figure 1 caption" },
  { key: "stats.2.value", label: "Figure 2" },
  { key: "stats.2.label", label: "Figure 2 caption" },
  { key: "stats.3.value", label: "Figure 3" },
  { key: "stats.3.label", label: "Figure 3 caption" },
  { key: "stats.4.value", label: "Figure 4" },
  { key: "stats.4.label", label: "Figure 4 caption" },
  { key: "cta.title", label: "Bottom CTA title" },
  { key: "cta.body", label: "Bottom CTA text" },
  { key: "cta.button", label: "Bottom CTA button" },
];

/**
 * The commercial terms, as a form.
 *
 * These four numbers decide when a paying customer stops being one, so they
 * belong to whoever owns that decision — not to a constant somebody has to
 * redeploy. The sweep runs hourly on its own; the button is here so a changed
 * term can be seen taking effect rather than taken on trust.
 */
const POLICY_FIELDS: { key: string; label: string; hint: string; unit?: string }[] = [
  { key: "billing.graceDays", label: "Grace period", unit: "days", hint: "after the due date before the bill is marked overdue. bKash and bank transfers have a human in the loop — a day is not enough." },
  { key: "billing.suspendAfterDays", label: "Suspend after", unit: "days", hint: "days past the due date before the resort stops accepting new entries. Reads and exports always stay open." },
  { key: "billing.noticeDays", label: "Notice before", unit: "days", hint: "warning sent before a trial ends and before a suspension lands." },
  { key: "platform.name", label: "Platform name", hint: "how the platform signs the mail it sends tenants about their account." },
  { key: "platform.supportEmail", label: "Support email", hint: "shown to tenants who need to sort out a bill." },
  { key: "platform.supportPhone", label: "Support phone", hint: "same, for the ones who would rather call." },
];

function PolicyTab() {
  const { push } = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  const [last, setLast] = useState<Record<string, number> | null>(null);

  const load = useCallback(() => {
    api<Record<string, string>>("/platform/settings").then(setValues).catch(() => setValues({}));
  }, []);
  useEffect(() => load(), [load]);

  async function save() {
    setBusy(true);
    try {
      const patch = Object.fromEntries(POLICY_FIELDS.map((f) => [f.key, values[f.key] ?? ""]));
      setValues(await api<Record<string, string>>("/platform/settings", { method: "PATCH", body: patch }));
      push("Policy saved — it applies on the next sweep");
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function sweep() {
    setSweeping(true);
    try {
      const r = await api<Record<string, number>>("/platform/billing/sweep", { method: "POST" });
      setLast(r);
      push(`Swept: ${r.duesRaised} billed, ${r.suspended} suspended, ${r.resumed} resumed`);
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setSweeping(false);
    }
  }

  return (
    <div className="mt-5 max-w-2xl space-y-4">
      <Card className="p-5">
        <div className="flex items-center gap-2 text-lg font-bold text-slate-900"><Gauge className="h-5 w-5 text-brand-500" /> Billing policy</div>
        <p className="mt-1 text-xs text-slate-500">
          Trials end, bills are raised and unpaid tenants are suspended automatically, once an hour.
          These are the windows that decide when.
        </p>
        <div className="mt-4 space-y-3">
          {POLICY_FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="text-xs font-semibold text-slate-500">{f.label}</span>
              <span className="block text-[10px] text-slate-400">{f.hint}</span>
              <span className="mt-1 flex items-center gap-2">
                <input
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                {f.unit && <span className="text-xs text-slate-400">{f.unit}</span>}
              </span>
            </label>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Btn loading={busy} onClick={save}>Save policy</Btn>
          <Btn size="sm" loading={sweeping} onClick={sweep} className="!bg-slate-100 !text-slate-700">
            <PlayCircle className="mr-1 h-4 w-4" /> Run the sweep now
          </Btn>
        </div>
        {last && (
          <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            Last run — trials ended {last.trialsEnded}, bills raised {last.duesRaised}, overdue {last.duesOverdue},
            suspended {last.suspended}, resumed {last.resumed}, notices sent {last.notices}.
          </div>
        )}
      </Card>
    </div>
  );
}

function CmsTab() {
  const { push } = useToast();
  const [rows, setRows] = useState<CmsRow[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api<CmsRow[]>("/platform/cms").then((r) => {
      setRows(r);
      setValues(Object.fromEntries(r.map((x) => [x.key, x.value])));
    }).catch(() => setRows([]));
  }, []);
  useEffect(() => load(), [load]);

  async function save(key: string) {
    setBusy(key);
    try {
      await api("/platform/cms", { method: "POST", body: { key, value: values[key] ?? "" } });
      push("Saved — refresh the homepage to see it");
      load();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-5 max-w-2xl space-y-4">
      <Card className="p-5">
        <div className="flex items-center gap-2 text-lg font-bold text-slate-900"><Globe className="h-5 w-5 text-brand-500" /> Front-end CMS</div>
        <p className="mt-1 text-xs text-slate-500">Edit the public homepage text without a deploy. Empty fields fall back to the built-in defaults.</p>
        <div className="mt-4 space-y-3">
          {CMS_FIELDS.map((f) => (
            <div key={f.key} className="flex items-end gap-2">
              <label className="flex-1">
                <span className="text-xs font-semibold text-slate-500">{f.label} <code className="text-[10px] text-slate-300">{f.key}</code></span>
                {f.hint && <span className="block text-[10px] text-slate-400">{f.hint}</span>}
                <input
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <Btn size="sm" loading={busy === f.key} onClick={() => save(f.key)}>Save</Btn>
            </div>
          ))}
        </div>
      </Card>
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
