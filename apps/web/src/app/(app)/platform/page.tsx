"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, money, dmy, type CmsRow, cur } from "@/lib/api";
import { useApi, keys, useQueryClient } from "@/lib/query";
import { Tabs } from "@/components/patterns";
import { useAuth } from "@/lib/auth";
import { PLAN_FEATURES } from "@rh/shared";
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
  maxResorts: number;
  maxStaff: number;
  trialDays: number;
  /** Keys from PLAN_FEATURES — what this plan includes, and what it locks. */
  features: string[];
  blurb: string | null;
  active: boolean;
  sortOrder: number;
  /** The one plan the pricing page recommends. */
  highlight: boolean;
}

/** Every field the panel can send. `name` is absent on purpose: it is fixed. */
type PlanEdit = {
  label: string;
  monthlyFee: number;
  maxRooms: number;
  maxResorts: number;
  maxStaff: number;
  trialDays: number;
  features: string[];
  blurb: string;
  active: boolean;
  sortOrder: number;
  highlight: boolean;
};

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
  const [walletFor, setWalletFor] = useState<AgentRow | null>(null);
  const [subPlan, setSubPlan] = useState("");
  const [subFee, setSubFee] = useState("5000");
  /** This resort's trial. Prefilled from the plan; "" means "whatever the plan says". */
  const [subTrial, setSubTrial] = useState("");
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

  /** Runs `work`, shows whatever it throws, and refreshes. One shape for all three. */
  async function planAction(work: () => Promise<unknown>) {
    setBusy(true);
    setErr("");
    try {
      await work();
      await loadAll();
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  }

  const savePlan = (name: string, patch: PlanEdit) =>
    planAction(() => api(`/platform/plans/${name}`, { method: "PATCH", body: patch }));

  const createPlan = (body: PlanEdit & { name: string }) =>
    planAction(() => api("/platform/plans", { method: "POST", body }));

  const deletePlan = (name: string) =>
    planAction(() => api(`/platform/plans/${name}`, { method: "DELETE" }));

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
                          setSubTrial(first ? String(first.trialDays) : "0");
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
                      {/* The wallet is the agency's account with the platform,
                          and until now nothing in the console could move it:
                          the balance was displayed on two screens and there was
                          no top-up, no payout, no anything. */}
                      <button
                        onClick={() => setWalletFor(a)}
                        title={`Wallet — ${a.name}`}
                        className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Wallet className="inline h-3.5 w-3.5" /> Wallet
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
        <div className="mt-5 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {plans.map((p) => (
              <PlanCard
                key={p.name}
                plan={p}
                busy={busy}
                onSave={savePlan}
                onDelete={deletePlan}
              />
            ))}
            <NewPlanCard busy={busy} onCreate={createPlan} taken={plans.map((p) => p.name)} />
          </div>
          <Card className="p-4">
            <div className="text-sm font-bold">How plan billing works</div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-500">
              <li>Assign a plan per resort in the <b>Resorts</b> tab — the trial length comes from the plan.</li>
              <li><b>Renew</b> generates the next period&apos;s due (fee × months) and extends the renewal date.</li>
              <li>Collect the money in the <b>Dues</b> tab — marking paid keeps the subscription <b>Active</b>.</li>
              <li>Fee edits here apply to <b>new subscriptions</b>; existing ones keep their fee until you renew them manually with the new amount in mind.</li>
              <li>
                Ticks are locks. Unticking a feature closes that part of the console for every resort
                <b> on a subscription to this plan</b> — a resort with no subscription keeps everything,
                because a plan is something you sold them.
              </li>
            </ul>
          </Card>
        </div>
      )}

      {/* ── subscriptions calendar ── */}
      {tab === "Calendar" && (
        <div className="mt-5">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <button onClick={() => shiftMonth(-1)} className="rounded-lg border border-slate-300 p-2 hover:bg-slate-50" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
            <div className="min-w-[9rem] text-center text-lg font-bold">
              {new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}
            </div>
            <button onClick={() => shiftMonth(1)} className="rounded-lg border border-slate-300 p-2 hover:bg-slate-50" aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
            {/* What the month is worth, before anyone counts squares. */}
            <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span className="text-slate-500">
                <b className="tabular-nums text-amber-700">{money((cal ?? []).reduce((n, c) => n + c.dues, 0))}</b> falling due
              </span>
              <span className="text-slate-500">
                <b className="tabular-nums text-sky-700">{(cal ?? []).reduce((n, c) => n + c.renewals, 0)}</b> renewals
              </span>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
              <div
                key={d}
                className={`p-1 text-center text-[10px] font-bold uppercase tracking-wider ${
                  // Thursday and Friday are this market's weekend
                  i === 4 || i === 5 ? "text-amber-600" : "text-slate-400"
                }`}
              >
                {d}
              </div>
            ))}
            {cal && (() => {
              const [y, m] = month.split("-").map(Number);
              const first = new Date(Date.UTC(y!, m! - 1, 1)).getUTCDay();
              const length = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
              const days: (number | null)[] = [
                ...Array(first).fill(null),
                ...Array.from({ length }, (_, i) => i + 1),
              ];
              // finish the last week, so the month is a rectangle rather than a
              // ragged edge that reads as a rendering fault
              while (days.length % 7 !== 0) days.push(null);
              const byDay = new Map(cal.map((c) => [Number(c.date.slice(8)), c]));
              const todayIso = new Date().toISOString().slice(0, 10);
              return days.map((day, i) => {
                const c = day ? byDay.get(day) : undefined;
                const iso = day ? `${month}-${String(day).padStart(2, "0")}` : "";
                const isToday = iso === todayIso;
                if (!day) return <div key={i} className="min-h-20 rounded-lg bg-slate-50/40" />;
                return (
                  <div
                    key={i}
                    className={`min-h-20 rounded-lg border p-1.5 text-xs transition ${
                      isToday
                        ? "border-brand-400 bg-brand-50/60 ring-1 ring-inset ring-brand-200"
                        : c
                          ? "border-slate-200 bg-white"
                          : "border-slate-100 bg-white"
                    }`}
                  >
                    <div className={isToday ? "font-black text-brand-700" : "font-bold text-slate-500"}>
                      {day}
                    </div>
                    {c && (
                      <div className="mt-1 space-y-1">
                        {c.dueCount > 0 && (
                          <div className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-800">
                            <div className="tabular-nums">{money(c.dues)}</div>
                            <div className="font-medium opacity-75">{c.dueCount} due</div>
                          </div>
                        )}
                        {c.renewals > 0 && (
                          <div className="rounded bg-sky-100 px-1 py-0.5 text-[10px] font-semibold text-sky-800">
                            {c.renewals} renewal{c.renewals === 1 ? "" : "s"}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
          {cal?.length === 0 && <div className="mt-3 text-center text-sm text-slate-400">Nothing falls due this month</div>}
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
                            {/* Approval only ever follows payment — that is the
                                rule this whole queue exists for. So the button
                                asks how the money arrived, not whether it did,
                                and the charge is settled on the spot instead of
                                sitting in the outstanding figure waiting for a
                                second trip to the Dues tab. */}
                            <Btn
                              disabled={busy}
                              onClick={() => {
                                const how = window.prompt(
                                  `Payment received for ${o.credits.toLocaleString("en-IN")} credits — ${o.resortName}, ${money(o.price)}.

` +
                                    `How did it arrive? bKash, bank transfer, cash…`,
                                  "bKash",
                                );
                                if (how === null) return;
                                void act(() =>
                                  api(`/platform/email-credit-orders/${o.id}/decision`, {
                                    method: "POST",
                                    body: { decision: "APPROVE", method: how.trim() || undefined },
                                  }),
                                );
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

      {walletFor && <WalletDrawer agent={walletFor} onClose={() => setWalletFor(null)} onMoved={() => void loadAll()} />}

      {tab === "Email credits" && <PackPricesCard />}

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
                  if (chosen) {
                    setSubFee(String(Number(chosen.monthlyFee)));
                    setSubTrial(String(chosen.trialDays));
                  }
                }}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                {(plansQ.data ?? []).filter((pl) => pl.active).map((pl) => (
                  <option key={pl.name} value={pl.name}>{pl.label} · {pl.name}</option>
                ))}
              </select>
              <label className="block text-xs font-semibold text-slate-500">Monthly fee ({cur()})</label>
              <input value={subFee} onChange={(e) => setSubFee(e.target.value)} type="number" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
              <label className="block text-xs font-semibold text-slate-500">Free trial (days) — 0 for none</label>
              <input value={subTrial} onChange={(e) => setSubTrial(e.target.value)} type="number" min={0} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
              {/* this used to read "Starts with a 14-day trial" in print, which
                  stopped being true the moment the trial length became a field */}
              <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                {subTrial.trim() === ""
                  ? "Whatever this plan sells."
                  : Number(subTrial) > 0
                    ? `Free until ${dmy(new Date(Date.now() + Number(subTrial) * 86400000))}, then ${money(Number(subFee))} a month.`
                    : "No free trial — the first month is due today."}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setSubFor(null)}>Cancel</Btn>
              <Btn
                disabled={busy}
                onClick={() => act(async () => { await api(`/platform/resorts/${subFor.id}/subscription`, { method: "POST", body: {
                    plan: subPlan,
                    monthlyFee: Number(subFee),
                    // an empty box means "whatever the plan sells", not "none":
                    // Number("") is 0, and 0 is a real answer here
                    ...(subTrial.trim() === "" ? {} : { trialDays: Number(subTrial) }),
                  } }); setSubFor(null); })}
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

/** A number box that keeps its own text, so a half-typed value is not fought over. */
function NumField({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (n: number) => void }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-slate-500">{label}</span>
      <input
        type="number"
        min={min}
        value={String(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-0.5 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
      />
    </label>
  );
}

/**
 * The tick boxes. This is the whole point of the screen.
 *
 * The list comes from `PLAN_FEATURES` in @rh/shared, which is also what the API
 * locks on and what the public pricing card prints. One vocabulary, three
 * readers — so a box unticked here is a door shut there, and neither can drift.
 */
function FeaturePicker({ chosen, onToggle }: { chosen: string[]; onToggle: (key: string) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-semibold text-slate-500">What this plan includes</div>
      {PLAN_FEATURES.map((f) => (
        <label key={f.key} className="flex cursor-pointer items-start gap-2 rounded-lg px-1.5 py-1 hover:bg-slate-50">
          <input
            type="checkbox"
            checked={chosen.includes(f.key)}
            onChange={() => onToggle(f.key)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
          />
          <span>
            <span className="block text-xs font-medium text-slate-700">{f.label}</span>
            <span className="block text-[10px] text-slate-400">{f.blurb}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

function toEdit(plan: PlanDef): PlanEdit {
  return {
    label: plan.label,
    monthlyFee: Number(plan.monthlyFee),
    maxRooms: plan.maxRooms,
    maxResorts: plan.maxResorts,
    maxStaff: plan.maxStaff,
    trialDays: plan.trialDays,
    features: [...(plan.features ?? [])],
    blurb: plan.blurb ?? "",
    active: plan.active,
    sortOrder: plan.sortOrder,
    highlight: plan.highlight,
  };
}

function PlanCard({
  plan,
  busy,
  onSave,
  onDelete,
}: {
  plan: PlanDef;
  busy: boolean;
  onSave: (name: string, patch: PlanEdit) => void;
  onDelete: (name: string) => void;
}) {
  const [form, setForm] = useState<PlanEdit>(() => toEdit(plan));
  // a save refetches the list; re-seed the form from whatever came back
  useEffect(() => { setForm(toEdit(plan)); }, [plan]);

  const set = <K extends keyof PlanEdit>(k: K, v: PlanEdit[K]) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (key: string) =>
    setForm((f) => ({
      ...f,
      features: f.features.includes(key) ? f.features.filter((k) => k !== key) : [...f.features, key],
    }));

  const dirty = JSON.stringify(form) !== JSON.stringify(toEdit(plan));

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-lg font-bold text-slate-900">{form.label || plan.name}</div>
          <div className="font-mono text-[10px] uppercase tracking-wide text-slate-400">{plan.name}</div>
        </div>
        <button
          onClick={() => set("active", !form.active)}
          title={form.active ? "On sale — click to retire" : "Retired — click to sell again"}
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${form.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}
        >
          {form.active ? "on sale" : "retired"}
        </button>
      </div>

      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-500">Name on the pricing page</span>
          <input
            value={form.label}
            onChange={(e) => set("label", e.target.value)}
            maxLength={40}
            className="mt-0.5 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-500">One line under it</span>
          <input
            value={form.blurb}
            onChange={(e) => set("blurb", e.target.value)}
            maxLength={200}
            placeholder="For small resorts leaving spreadsheets"
            className="mt-0.5 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <NumField label={`Monthly fee (${cur()})`} value={form.monthlyFee} min={0} onChange={(n) => set("monthlyFee", n)} />
          <NumField label="Free trial (days)" value={form.trialDays} min={0} onChange={(n) => set("trialDays", n)} />
          <NumField label="Rooms per resort" value={form.maxRooms} min={1} onChange={(n) => set("maxRooms", n)} />
          <NumField label="Resorts per owner" value={form.maxResorts} min={1} onChange={(n) => set("maxResorts", n)} />
          <NumField label="Staff accounts" value={form.maxStaff} min={1} onChange={(n) => set("maxStaff", n)} />
          <NumField label="Shown in position" value={form.sortOrder} min={0} onChange={(n) => set("sortOrder", n)} />
        </div>

        <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5">
          <input
            type="checkbox"
            checked={form.highlight}
            onChange={() => set("highlight", !form.highlight)}
            className="h-4 w-4 accent-brand-600"
          />
          <span className="text-xs font-medium text-slate-700">
            Recommend this one — wears the &ldquo;Most popular&rdquo; ribbon
          </span>
        </label>

        <FeaturePicker chosen={form.features} onToggle={toggle} />

        <div className="flex gap-2">
          <button
            disabled={!dirty || busy}
            onClick={() => onSave(plan.name, form)}
            className="flex-1 rounded-lg bg-brand-600 py-2 text-sm font-bold text-white transition hover:bg-brand-700 disabled:opacity-40"
          >
            {busy ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </button>
          <button
            disabled={busy}
            onClick={() => {
              if (window.confirm(`Delete the ${form.label || plan.name} plan? Retiring it instead keeps its customers and takes it off the pricing page.`)) {
                onDelete(plan.name);
              }
            }}
            className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-40"
          >
            Delete
          </button>
        </div>
      </div>
    </Card>
  );
}

const BLANK_PLAN: PlanEdit & { name: string } = {
  name: "",
  label: "",
  monthlyFee: 0,
  maxRooms: 10,
  maxResorts: 1,
  maxStaff: 1,
  trialDays: 14,
  features: [],
  blurb: "",
  active: true,
  sortOrder: 0,
  highlight: false,
};

function NewPlanCard({
  busy,
  onCreate,
  taken,
}: {
  busy: boolean;
  onCreate: (body: PlanEdit & { name: string }) => void;
  taken: string[];
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(BLANK_PLAN);

  if (!open) {
    return (
      <button
        onClick={() => { setForm(BLANK_PLAN); setOpen(true); }}
        className="flex min-h-[220px] items-center justify-center rounded-xl border-2 border-dashed border-slate-300 text-sm font-semibold text-slate-500 transition hover:border-brand-400 hover:text-brand-600"
      >
        + New plan
      </button>
    );
  }

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const name = form.name.toUpperCase().replace(/[^A-Z0-9_]/g, "");
  const nameProblem = !/^[A-Z][A-Z0-9_]{1,15}$/.test(name)
    ? "2–16 characters, A–Z, 0–9 or _, starting with a letter"
    : taken.includes(name)
      ? "A plan already has that name"
      : null;

  return (
    <Card className="p-5">
      <div className="text-lg font-bold text-slate-900">New plan</div>
      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-500">Name — fixed once saved, because subscriptions point at it</span>
          <input
            value={name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="SEASON"
            className="mt-0.5 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-sm uppercase"
          />
          {name && nameProblem && <span className="mt-1 block text-[10px] font-medium text-red-600">{nameProblem}</span>}
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-500">Name on the pricing page</span>
          <input
            value={form.label}
            onChange={(e) => set("label", e.target.value)}
            maxLength={40}
            placeholder="Season"
            className="mt-0.5 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-500">One line under it</span>
          <input
            value={form.blurb}
            onChange={(e) => set("blurb", e.target.value)}
            maxLength={200}
            className="mt-0.5 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <NumField label={`Monthly fee (${cur()})`} value={form.monthlyFee} min={0} onChange={(n) => set("monthlyFee", n)} />
          <NumField label="Free trial (days)" value={form.trialDays} min={0} onChange={(n) => set("trialDays", n)} />
          <NumField label="Rooms per resort" value={form.maxRooms} min={1} onChange={(n) => set("maxRooms", n)} />
          <NumField label="Resorts per owner" value={form.maxResorts} min={1} onChange={(n) => set("maxResorts", n)} />
          <NumField label="Staff accounts" value={form.maxStaff} min={1} onChange={(n) => set("maxStaff", n)} />
          <NumField label="Shown in position" value={form.sortOrder} min={0} onChange={(n) => set("sortOrder", n)} />
        </div>

        <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5">
          <input
            type="checkbox"
            checked={form.highlight}
            onChange={() => set("highlight", !form.highlight)}
            className="h-4 w-4 accent-brand-600"
          />
          <span className="text-xs font-medium text-slate-700">
            Recommend this one — wears the &ldquo;Most popular&rdquo; ribbon
          </span>
        </label>

        <FeaturePicker
          chosen={form.features}
          onToggle={(key) =>
            setForm((f) => ({
              ...f,
              features: f.features.includes(key) ? f.features.filter((k) => k !== key) : [...f.features, key],
            }))
          }
        />

        <div className="flex gap-2">
          <button
            disabled={busy || !!nameProblem || !form.label.trim()}
            onClick={() => { onCreate({ ...form, name }); setOpen(false); }}
            className="flex-1 rounded-lg bg-brand-600 py-2 text-sm font-bold text-white transition hover:bg-brand-700 disabled:opacity-40"
          >
            {busy ? "Creating…" : "Create plan"}
          </button>
          <button
            onClick={() => setOpen(false)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
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

/**
 * What a pack costs, and where the buyer sends the money.
 *
 * The prices were a platform setting from the start — commercial terms belong
 * to the person who sets them — but there was no way to edit them anywhere in
 * the console. Changing what the platform sells meant a raw API call, so in
 * practice it never changed. This is the screen that was missing, and it sits
 * on the tab where the packs are approved, because selling mail and taking the
 * money for it are one job.
 */
/**
 * The agency's account with the platform, and the only place it moves.
 *
 * The balance was shown on two screens and no screen could change it: there
 * was no top-up, no payout, nothing. Meanwhile the API let any resort the
 * agent sold move the money and read every line of it. Both halves of that are
 * fixed underneath; this is the half that was simply missing.
 *
 * There is no gateway, so a top-up is money the agency has already handed
 * over — the note is where the bKash reference goes, and it is the only record
 * that will exist.
 */
function WalletDrawer({
  agent,
  onClose,
  onMoved,
}: {
  agent: AgentRow;
  onClose: () => void;
  onMoved: () => void;
}) {
  const { push } = useToast();
  const [view, setView] = useState<WalletView | null>(null);
  const [kind, setKind] = useState("TOPUP");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<WalletView>(`/wallets/${agent.id}`)
      .then(setView)
      .catch(() => setView(null));
  }, [agent.id]);
  useEffect(() => load(), [load]);

  async function move() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value === 0) return;
    const verb = kind === "TOPUP" ? "Add" : kind === "PAYOUT" ? "Pay out" : "Adjust by";
    if (!window.confirm(`${verb} ${money(Math.abs(value))} — ${agent.name}?\n\n${note || "No note"}`)) return;
    setBusy(true);
    try {
      await api(`/wallets/${agent.id}/txns`, {
        method: "POST",
        body: { kind, amount: value, note: note || undefined },
      });
      push(kind === "TOPUP" ? "Money added" : kind === "PAYOUT" ? "Paid out" : "Adjusted");
      setAmount("");
      setNote("");
      load();
      onMoved();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl bg-white shadow-xl"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="text-lg font-bold text-slate-900">{agent.name}</div>
          <p className="mt-0.5 text-xs text-slate-500">
            What this agency holds with the platform. Bookings and commission are settled with the
            resort, not here.
          </p>

          <div className="mt-4 rounded-xl bg-slate-50 p-4">
            <div className="text-[10px] font-medium uppercase text-slate-400">Balance</div>
            <div className="text-3xl font-black tabular-nums text-slate-900">
              {view ? money(view.balance) : "…"}
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="text-xs font-semibold text-slate-500">What is happening</span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="TOPUP">Money received from the agency</option>
                <option value="PAYOUT">Money returned to the agency</option>
                <option value="ADJUST">Correction</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500">
                Amount ({cur()}){kind === "ADJUST" ? " — negative to take away" : ""}
              </span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm tabular-nums"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500">Note</span>
              <span className="block text-[10px] text-slate-400">
                The bKash TrxID or bank reference — this is the only record of how it arrived.
              </span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="bKash TrxID 8X2K1M"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <Btn loading={busy} disabled={!amount} onClick={() => void move()}>
              Record it
            </Btn>
          </div>

          <div className="mt-5">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Statement</div>
            {!view || view.txns.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">Nothing has moved yet.</p>
            ) : (
              <table className="mt-2 w-full text-sm">
                <thead>
                  <tr>
                    <Th>When</Th>
                    <Th>What</Th>
                    <Th className="text-right">Amount</Th>
                    <Th className="text-right">Balance</Th>
                  </tr>
                </thead>
                <tbody>
                  {view.txns.map((t) => (
                    <tr key={t.id} className="border-t border-slate-100">
                      <Td className="text-xs text-slate-400">{dmy(t.createdAt)}</Td>
                      <Td className="text-xs">
                        <div>{WALLET_KIND_LABELS[t.kind] ?? t.kind}</div>
                        {t.note && <div className="text-slate-400">{t.note}</div>}
                      </Td>
                      <Td className={`text-right tabular-nums ${t.amount < 0 ? "text-red-600" : "text-emerald-700"}`}>
                        {money(t.amount)}
                      </Td>
                      <Td className="text-right tabular-nums text-slate-500">{money(t.balanceAfter)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="mt-5 flex justify-end">
            <Btn variant="ghost" onClick={onClose}>
              Close
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

const WALLET_KIND_LABELS: Record<string, string> = {
  TOPUP: "Received",
  PAYOUT: "Returned",
  ADJUST: "Correction",
  // written before the wallet was narrowed to the platform's own account
  COMMISSION: "Commission (historic)",
  BOOKING_HOLD: "Booking (historic)",
  REFUND: "Refund (historic)",
};

interface WalletView {
  balance: number;
  active: boolean;
  txns: {
    id: string;
    kind: string;
    amount: number;
    balanceAfter: number;
    note: string | null;
    createdAt: string;
  }[];
}

function PackPricesCard() {
  const { push } = useToast();
  const [packs, setPacks] = useState<{ credits: string; price: string }[]>([]);
  const [payTo, setPayTo] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Record<string, string>>("/platform/settings")
      .then((v) => {
        try {
          const parsed = JSON.parse(v["email.creditPacks"] ?? "[]") as { credits: number; price: number }[];
          setPacks(parsed.map((p) => ({ credits: String(p.credits), price: String(p.price) })));
        } catch {
          setPacks([]);
        }
        setPayTo(v["platform.paymentInstructions"] ?? "");
      })
      .catch(() => setPacks([]));
  }, []);
  useEffect(() => load(), [load]);

  async function save() {
    const rows = packs
      .map((p) => ({ credits: Number(p.credits), price: Number(p.price) }))
      .filter((p) => p.credits > 0 && p.price >= 0);
    if (rows.length === 0) {
      push("Keep at least one pack — an empty list falls back to the shipped prices", "err");
      return;
    }
    setBusy(true);
    try {
      await api("/platform/settings", {
        method: "PATCH",
        body: {
          "email.creditPacks": JSON.stringify(rows),
          "platform.paymentInstructions": payTo,
        },
      });
      push("Prices saved — buyers see them straight away");
      load();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-4 max-w-2xl p-5">
      <div className="text-lg font-bold text-slate-900">What a pack costs</div>
      <p className="mt-1 text-xs text-slate-500">
        These are the packs a resort sees. Nothing is charged online — a request waits here until you
        have the money, and approving it is the receipt.
      </p>

      <div className="mt-4 space-y-2">
        {packs.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={p.credits}
              onChange={(e) => setPacks(packs.map((x, j) => (i === j ? { ...x, credits: e.target.value } : x)))}
              className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
              aria-label="Emails"
            />
            <span className="text-xs text-slate-400">emails for</span>
            <input
              type="number"
              min={0}
              value={p.price}
              onChange={(e) => setPacks(packs.map((x, j) => (i === j ? { ...x, price: e.target.value } : x)))}
              className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
              aria-label={`Price in ${cur()}`}
            />
            <span className="text-xs text-slate-400">{cur()}</span>
            <button
              onClick={() => setPacks(packs.filter((_, j) => j !== i))}
              className="text-xs font-semibold text-red-500 hover:underline"
            >
              Remove
            </button>
          </div>
        ))}
        <Btn size="sm" variant="ghost" onClick={() => setPacks([...packs, { credits: "", price: "" }])}>
          + Add a pack
        </Btn>
      </div>

      <label className="mt-5 block">
        <span className="text-xs font-semibold text-slate-500">How to pay</span>
        <span className="block text-[10px] text-slate-400">
          Shown to the buyer beside the packs. A bKash number, a bank account, whatever you actually use.
        </span>
        <textarea
          value={payTo}
          onChange={(e) => setPayTo(e.target.value)}
          rows={3}
          placeholder="bKash 01XXXXXXXXX (personal) — send the amount, then WhatsApp the TrxID"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      <div className="mt-4">
        <Btn loading={busy} onClick={() => void save()}>Save prices</Btn>
      </div>
    </Card>
  );
}

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
