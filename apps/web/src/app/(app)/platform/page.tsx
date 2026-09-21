"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { client, money, dmy, type CmsRow, cur } from "@/lib/api";
import { useApi, keys, useQueryClient } from "@/lib/query";
import { Tabs, Table } from "@/components/patterns";
import { MoneyReceived } from "@/components/money-received";
import { useAuth } from "@/lib/auth";
import {
  PLAN_FEATURES,
  type BillingSweepResult,
  scheduleSentence,
  type NewPlan,
  type PlanDefinition,
  type PlanEdit,
  type PlatformAgentRow,
  type PlatformResortRow,
  type PlatformWallet,
} from "@rh/shared";
import { PlanLadder } from "./plan-ladder";
import { Card, Empty, Spinner, Th, Td, useToast } from "@/components/ui";
import { Button as Btn } from "@/components/ui";
import { HowItArrived, paymentMethodsFrom } from "./how-it-arrived";
import { POLICY_FIELDS } from "./policy-fields";
import { Building2, Users, RefreshCw, ChevronLeft, ChevronRight, Ban, CheckCircle2, CreditCard, Wallet, LogIn, Globe, Gauge, PlayCircle } from "lucide-react";
import { monthOf, todayIn, PLATFORM_TIMEZONE } from "@/lib/resort-dates";
import { ErrorState } from "@/components/error-state";
import { displayPhone } from "@/lib/contact";
import { AgencyQueue } from "./agency-queue";
import { OffersTab } from "./offers-tab";

/**
 * An account the platform opened to try things with.
 *
 * Amber rather than red: it is not a problem, it is a note. The same badge
 * on a resort row and an agency row, because both are the same flag on the
 * same tenant.
 */
function DemoBadge() {
  return (
    <span
      title="Opened by the platform to test with. Left out of the figures on Overview."
      className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-700 ring-1 ring-amber-200"
    >
      demo
    </span>
  );
}

/**
 * No wire shapes written here any more.
 *
 * Ten interfaces used to sit in this file — Overview, PlatformResortRow, PlatformAgentRow,
 * PlanDefinition, SubscriptionRow, DueRow, CreditOrderRow, ChargeRow, CalCell and
 * PlatformMoney — each next to an `api<That>("/platform/...")` call that
 * asserted the server agreed. One of them was wrong: `PlatformResortRow` claimed a
 * `scheduleLabel` on the subscription, `allResorts` never selected it, and
 * so the badge beside every plan on the Resorts tab was blank and the renew
 * button offered "one more  period". Nothing could have caught it, because
 * the interface WAS the check.
 */

/** Every field the plan form holds — the wire type, with nothing optional. */
type PlanForm = Required<PlanEdit>;

const TABS = ["Overview", "Resorts", "Agents", "Plans", "Offers", "Subscriptions", "Dues", "Money received", "Email credits", "Calendar", "Billing policy", "Website CMS"] as const;

/**
 * The platform's cash book: subscriptions, one-off charges and wallet top-ups
 * in one list. Three tables answering one question — what came in, from which
 * customer, and who here confirmed it. With no gateway, this is the only
 * account of the money there is.
 */
const KIND_LABEL: Record<string, string> = {
  SUBSCRIPTION: "Subscription",
  CHARGE: "Charge",
  WALLET_TOPUP: "Wallet top-up",
};

export default function PlatformPage() {
  const { impersonate, exitImpersonation, isImpersonating } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [subFor, setSubFor] = useState<PlatformResortRow | null>(null);
  const [walletFor, setWalletFor] = useState<PlatformAgentRow | null>(null);
  const [subPlan, setSubPlan] = useState("");
  /** MONTHLY unless the super admin says otherwise, like every signup. */
  const [subShelf, setSubShelf] = useState<number | null>(null);
  /** kept beside the id so a change of plan can keep the same shelf by name */
  const [subShelfLabel, setSubShelfLabel] = useState("");
  const [subFee, setSubFee] = useState("5000");
  /** This resort's trial. Prefilled from the plan; "" means "whatever the plan says". */
  const [subTrial, setSubTrial] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  /**
   * The collection waiting to be told how the money arrived.
   *
   * Both of these buttons used to post `method: "CASH"` regardless, so a bKash
   * transfer and a bank transfer were both filed as cash — see how-it-arrived.
   */
  const [collecting, setCollecting] = useState<{ what: string; pay: (method: string) => void } | null>(null);

  // five independent reads: the overview lands first and the tables fill in
  // behind it, instead of every tab waiting on the slowest query
  const ovQ = useApi(keys.platform("overview"), () => client.platform.overview());
  const resortsQ = useApi(keys.platform("resorts"), () => client.platform.resorts());
  const agentsQ = useApi(keys.platform("agents"), () => client.platform.agents());
  const duesQ = useApi(keys.platform("dues"), () => client.platform.dues());
  // the platform's own list, not an array written into this file
  const settingsQ = useApi(keys.platform("settings"), () => client.platform.settings());
  const payMethods = paymentMethodsFrom(settingsQ.data ?? {});
  /**
   * One-off charges — an email credit pack today; SMS packs and setup fees will
   * be the same shape. They live beside the subscription dues rather than in
   * their own tab, because "what does this tenant owe" is one question.
   */
  const chargesQ = useApi(keys.platform("charges"), () => client.platform.charges());
  // only on its own tab: it reads three tables, and an overview should not
  // wait on a report nobody opened
  const moneyQ = useApi(
    keys.platform("money-received"),
    () => client.platform.moneyReceived(),
    { enabled: tab === "Money received" },
  );
  const plansQ = useApi(keys.platform("plans"), () => client.platform.plans());
  /**
   * Email credit packs waiting on a decision.
   *
   * A pack used to be granted the moment a resort clicked it, raising a
   * billable charge nobody here had agreed to. Now it queues, and this is
   * where somebody says yes.
   */
  const creditOrdersQ = useApi(
    keys.platform("credit-orders"),
    () => client.platform.creditOrders(),
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
    planAction(() => client.platform.updatePlan(name, patch));

  const createPlan = (body: NewPlan) => planAction(() => client.platform.createPlan(body));

  const deletePlan = (name: string) => planAction(() => client.platform.deletePlan(name));

  const [calYear, calMonth] = month.split("-").map(Number);
  const calQ = useApi(
    keys.platform("sub-calendar", month),
    () =>
      client.platform.subCalendar(monthOf.firstDay(month), monthOf.lastDay(month)),
    // only fetched once the tab is actually open
    { enabled: tab === "Calendar" },
  );
  const cal = calQ.data ?? null;

  const subsQ = useApi(
    keys.platform("subscriptions"),
    () => client.platform.subscriptions(),
    { enabled: tab === "Subscriptions" },
  );
  const subs = subsQ.data ?? null;

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
      const r = await client.platform.loginAs(userId);
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

  const sub = (r: PlatformResortRow) => r.tenant.subscriptions[0];

  return (
    <div>
      {/* asked before anything is marked paid, for dues and for one-off charges */}
      {collecting && (
        <HowItArrived
          methods={payMethods}
          what={collecting.what}
          onPick={(m) => {
            const { pay } = collecting;
            setCollecting(null);
            pay(m);
          }}
          onCancel={() => setCollecting(null)}
        />
      )}
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
          {/* Said out loud. A total that quietly differs from the list on the
              next tab is worse than one that is wrong where you can see it. */}
          {(ov.demoExcluded.resorts > 0 || ov.demoExcluded.agencies > 0) && (
            <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
              These figures leave out{" "}
              {ov.demoExcluded.resorts > 0 && `${ov.demoExcluded.resorts} demo resort${ov.demoExcluded.resorts === 1 ? "" : "s"}`}
              {ov.demoExcluded.resorts > 0 && ov.demoExcluded.agencies > 0 && " and "}
              {ov.demoExcluded.agencies > 0 && `${ov.demoExcluded.agencies} demo agenc${ov.demoExcluded.agencies === 1 ? "y" : "ies"}`}
              {" "}— accounts opened to test with. They are still listed on the tabs.
            </div>
          )}
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
          <Table minWidth={0} tableClassName="text-sm">
            <thead>
              <tr>
                <Th>Resort</Th><Th>Plan</Th><Th>Status</Th><Th>Rooms</Th><Th>Bookings</Th><Th>Renews</Th><Th />
              </tr>
            </thead>
            <tbody>
              {resorts.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-slate-800">{r.name}</span>
                      {r.tenant.demo && <DemoBadge />}
                    </div>
                    <div className="text-xs text-slate-400">{r.location ?? "—"} · tenant {r.tenant.name}</div>
                  </Td>
                  <Td>
                    {sub(r) ? (
                      <>
                        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700">{sub(r)!.plan}</span>
                        {/* the term, in the owner's own word for it — ৳120,000
                            is either an outlier or a year, and only this says which */}
                        {sub(r)!.scheduleLabel && (
                          <span className="ml-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
                            {sub(r)!.scheduleLabel}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-slate-400">no subscription</span>
                    )}
                  </Td>
                  <Td>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${r.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{r.status}</span>
                  </Td>
                  <Td>{r._count.rooms}</Td>
                  <Td>{r._count.bookings}</Td>
                  <Td>{sub(r)?.renewsAt ? dmy(sub(r)!.renewsAt) : "—"}</Td>
                  <Td>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {r.userResorts?.[0] && (
                        <button
                          onClick={() => loginAs(r.userResorts![0]!.user.id)}
                          title={`Log in as ${r.userResorts[0].user.name} (${displayPhone(r.userResorts[0].user.phone)})`}
                          className="rounded-lg border border-brand-300 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                        >
                          <LogIn className="inline h-3.5 w-3.5" /> Login as
                        </button>
                      )}
                      <button
                        onClick={() => {
                          const first = (plansQ.data ?? []).find((pl) => pl.active);
                          const shelf = first?.schedules.find((x) => x.active) ?? null;
                          setSubFor(r);
                          setSubPlan(first?.name ?? "");
                          setSubShelf(shelf?.id ?? null);
                          setSubShelfLabel(shelf?.label ?? "");
                          setSubFee(shelf ? String(shelf.openingFee) : "");
                          setSubTrial(first ? String(first.trialDays) : "0");
                        }}
                        className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Subscribe
                      </button>
                      {sub(r) && (
                        <>
                          <button
                            // one of this subscription's own periods, whatever
                            // length the rung it is standing on says that is
                            onClick={() => act(() => client.platform.renew(Number(sub(r)!.id), 1))}
                            title={`Renew for one more ${sub(r)!.scheduleLabel?.toLowerCase() ?? ""} period`}
                            className="rounded-lg border border-brand-300 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                          >
                            Renew
                          </button>
                          <button
                            onClick={() => act(() => client.platform.cancelSubscription(Number(sub(r)!.id)))}
                            className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => act(() => client.platform.setResortStatus(r.id, r.status === "active" ? "suspended" : "active"))}
                        className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        {r.status === "active" ? "Suspend" : "Activate"}
                      </button>
                      {/* on the account, not the resort: one owner's three
                          resorts are one customer and one switch */}
                      <button
                        onClick={() => act(() => client.platform.setAccountDemo(r.tenant.id, !r.tenant.demo))}
                        title={r.tenant.demo
                          ? "Count this account in the platform's figures again"
                          : "Mark as an account opened to test with, and leave it out of the figures"}
                        className="rounded-lg border border-amber-300 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                      >
                        {r.tenant.demo ? "Not demo" : "Mark demo"}
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {resorts.length === 0 && <Empty msg="No resorts yet" />}
        </Card>
      )}

      {/* ── agents ── */}
      {tab === "Agents" && <div className="mt-5"><AgencyQueue /></div>}
      {tab === "Agents" && agents && (
        <Card className="mt-5 overflow-x-auto">
          <Table minWidth={0} tableClassName="text-sm">
            <thead>
              <tr><Th>Agent</Th><Th>Sold at</Th><Th>Bookings</Th><Th>Wallet</Th><Th>Status</Th><Th /></tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.id} className="border-t border-slate-100">
                  <Td>
                    <div className="font-semibold text-slate-800">{a.name}</div>
                    <div className="text-xs text-slate-400">{displayPhone(a.phone)}</div>
                  </Td>
                  <Td className="text-xs text-slate-500">{a.resorts.map((r) => r.name).join(", ") || "—"}</Td>
                  <Td>{a.bookings}</Td>
                  <Td>{a.wallet ? <span className={a.wallet.active ? "text-emerald-700" : "text-slate-400"}>{money(a.wallet.balance)}</span> : "—"}</Td>
                  <Td>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${a.status === "active" ? "bg-emerald-50 text-emerald-700" : a.status === "pending" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>{a.status}</span>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap justify-end gap-1.5">
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
                      {/* No Activate/Suspend here: those were one resort's
                          switch, borrowed through the agent's first linked
                          resort. The platform's lever is verification in the
                          agencies queue above; a resort's is its own block. */}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
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
              // which square to ring: the platform's day, not the server's
              const todayIso = todayIn(PLATFORM_TIMEZONE);
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

      {/* ── subscriptions: what the platform has sold, to both kinds of customer ── */}
      {tab === "Subscriptions" && (
        <Card className="mt-5 overflow-x-auto">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="text-sm font-bold text-slate-800">Subscriptions — {subs?.length ?? 0}</h3>
            <span className="text-xs text-slate-400">Every account the platform bills, resort owners and agencies alike. Closed ones stay, so the history reads.</span>
          </div>
          <Table minWidth={0} tableClassName="text-sm">
            <thead>
              <tr><Th>Customer</Th><Th>Plan</Th><Th>Status</Th><Th className="text-right">Monthly</Th><Th>Started</Th><Th>Trial ends / renews</Th><Th className="text-right">Outstanding</Th></tr>
            </thead>
            <tbody>
              {(subs ?? []).map((s) => (
                <tr key={s.id} className="border-t border-slate-100 align-top">
                  <Td>
                    <div className="font-semibold text-slate-800">{s.account.name}</div>
                    <div className="text-[11px] text-slate-400">
                      {s.account.kind === "AGENCY" ? "Travel agency" : "Resort owner"}
                      {s.account.status !== "active" ? ` · ${s.account.status}` : ""}
                    </div>
                  </Td>
                  <Td>
                    {s.plan}
                    {s.pendingPlan && <div className="text-[11px] text-amber-600">→ {s.pendingPlan} at renewal</div>}
                  </Td>
                  <Td>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                      s.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700"
                        : s.status === "TRIAL" ? "bg-sky-50 text-sky-700"
                        : s.status === "PAST_DUE" ? "bg-red-50 text-red-700"
                        : "bg-slate-100 text-slate-500"}`}>{s.status}</span>
                    {s.note && <div className="mt-0.5 text-[11px] text-slate-400">{s.note}</div>}
                  </Td>
                  {/* the fee is meaningless without the term it is charged
                      over: ৳120,000 is either an outlier or a year */}
                  <Td className="text-right font-bold">
                    {money(s.fee)}
                    <div className="text-[10px] font-medium text-slate-400">
                      {s.scheduleLabel ?? "no schedule"}
                      {s.pendingScheduleLabel && s.pendingScheduleLabel !== s.scheduleLabel && (
                        <span className="text-amber-600"> → {s.pendingScheduleLabel}</span>
                      )}
                    </div>
                  </Td>
                  <Td className="text-xs text-slate-500">{dmy(s.startedAt)}</Td>
                  <Td className="text-xs text-slate-500">
                    {s.cancelledAt ? `cancelled ${dmy(s.cancelledAt)}` : s.trialEndsAt ? `trial → ${dmy(s.trialEndsAt)}` : s.renewsAt ? dmy(s.renewsAt) : "—"}
                  </Td>
                  <Td className={`text-right font-bold ${s.outstanding > 0 ? "text-red-600" : "text-slate-400"}`}>
                    {s.outstanding > 0 ? money(s.outstanding) : "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {subs && subs.length === 0 && <Empty msg="Nothing sold yet" />}
        </Card>
      )}

      {/* ── dues ── */}
      {tab === "Money received" && (
        moneyQ.isLoading && !moneyQ.data ? (
          <div className="mt-5"><Spinner /></div>
        ) : (
          <div className="mt-5">
            <MoneyReceived
              title="What the platform received"
              total={moneyQ.data?.total}
              rows={moneyQ.data?.rows ?? []}
              recent={(moneyQ.data?.recent ?? []).map((r) => ({
                id: r.id,
                at: r.at,
                amount: r.amount,
                method: r.method,
                from: r.from,
                /*
                  The kind is worth saying — a subscription, a one-off charge
                  and an agency topping up its float are three different things
                  arriving in the same column — but not twice: a top-up's
                  description is already its kind, and "Wallet top-up · Wallet
                  top-up" is what naive concatenation reads like.
                */
                what: r.what.startsWith(KIND_LABEL[r.kind] ?? "")
                  ? r.what
                  : `${KIND_LABEL[r.kind]} · ${r.what}`,
                receivedBy: r.receivedBy,
                note: r.note,
              }))}
              emptyMsg="Nothing collected yet"
            />
          </div>
        )
      )}

      {tab === "Dues" && dues && (
        <Card className="mt-5 overflow-x-auto">
          <Table minWidth={0} tableClassName="text-sm">
            <thead>
              <tr><Th>Customer</Th><Th>Plan</Th><Th>Period</Th><Th>Due date</Th><Th className="text-right">Amount</Th><Th>Status</Th><Th /></tr>
            </thead>
            <tbody>
              {dues.map((d) => (
                <tr key={d.id} className="border-t border-slate-100">
                  <Td className="font-semibold text-slate-800">{d.account.name}</Td>
                  <Td>{d.subscription.plan}</Td>
                  <Td className="text-xs text-slate-500">{dmy(d.periodStart)} → {dmy(d.periodEnd)}</Td>
                  <Td>{dmy(d.dueDate)}</Td>
                  <Td className="text-right font-bold">{money(d.amount)}</Td>
                  <Td>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${d.status === "PAID" ? "bg-emerald-50 text-emerald-700" : d.status === "OVERDUE" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{d.status}</span>
                  </Td>
                  <Td>
                    {d.status !== "PAID" && (
                      <button onClick={() => setCollecting({
                        what: `${d.account.name} · ${d.subscription.plan} — ${money(d.amount)}`,
                        pay: (m) => act(() => client.platform.payDue(Number(d.id), m)),
                      })} className="rounded-lg border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
                        Mark paid
                      </button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
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
          <Table minWidth={0} tableClassName="text-sm">
            <thead>
              <tr><Th>Customer</Th><Th>What for</Th><Th>Raised</Th><Th className="text-right">Amount</Th><Th>Status</Th><Th /></tr>
            </thead>
            <tbody>
              {(chargesQ.data ?? []).map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <Td className="font-semibold text-slate-800">
                    {c.account.name}
                    {c.resort && <div className="text-[11px] font-normal text-slate-400">{c.resort.name}</div>}
                  </Td>
                  <Td>{c.description}</Td>
                  <Td className="text-xs text-slate-500">{dmy(c.createdAt)}</Td>
                  <Td className="text-right font-bold">{money(c.amount)}</Td>
                  <Td>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${c.status === "PAID" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{c.status}</span>
                  </Td>
                  <Td>
                    {c.status !== "PAID" && (
                      <button onClick={() => setCollecting({
                        what: `${c.account.name} · ${c.description} — ${money(c.amount)}`,
                        pay: (m) => act(() => client.platform.payCharge(c.id, m)),
                      })} className="rounded-lg border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
                        Mark paid
                      </button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
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
            <Table minWidth={720} tableClassName="text-sm">
                <thead>
                  <tr><Th>Requested</Th><Th>Customer</Th><Th>Who</Th><Th className="text-right">Credits</Th><Th className="text-right">Price</Th><Th>Status</Th><Th /></tr>
                </thead>
                <tbody>
                  {(creditOrders ?? []).map((o) => (
                    <tr key={o.id} className="border-t border-slate-100">
                      <Td className="text-xs text-slate-400">{new Date(o.createdAt).toLocaleDateString("en-GB")}</Td>
                      <Td className="font-medium">
                        {o.accountName}
                        {o.resortName && <div className="text-[11px] font-normal text-slate-400">{o.resortName}</div>}
                      </Td>
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
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {/* Approval only ever follows payment — that is the
                                rule this whole queue exists for. So the button
                                asks how the money arrived, not whether it did,
                                and the charge is settled on the spot instead of
                                sitting in the outstanding figure waiting for a
                                second trip to the Dues tab. */}
                            <Btn
                              disabled={busy}
                              onClick={() =>
                                // the same question the Dues tab asks, from the
                                // same list — typed free text here meant "bkash",
                                // "Bkash" and "bKash" were three methods
                                setCollecting({
                                  what: `${o.accountName} · ${o.credits.toLocaleString("en-IN")} credits — ${money(o.price)}`,
                                  pay: (m) =>
                                    act(() =>
                                      client.platform.decideCreditOrder(o.id, "APPROVE", { method: m }),
                                    ),
                                })
                              }
                            >
                              Approve
                            </Btn>
                            <Btn
                              variant="ghost"
                              disabled={busy}
                              onClick={() => {
                                const note = window.prompt(`Decline ${o.credits.toLocaleString("en-IN")} credits for ${o.accountName}. Reason (they will see it):`);
                                if (note === null) return;
                                void act(() => client.platform.decideCreditOrder(o.id, "REJECT", { note: note || undefined }));
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
              </Table>
          )}
        </Card>
      )}

      {walletFor && <WalletDrawer agent={walletFor} onClose={() => setWalletFor(null)} onMoved={() => void loadAll()} />}

      {tab === "Email credits" && <PackPricesCard />}

      {tab === "Offers" && <div className="mt-5"><OffersTab /></div>}
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
                    /**
                     * Every plan has its own shelves, so one selected for the
                     * last plan does not exist on this one. Keeping the label
                     * where it survives is what stops the form jumping back to
                     * the first row on every change.
                     */
                    const here = chosen.schedules.filter((x) => x.active);
                    const same = here.find((x) => x.label === subShelfLabel);
                    const shelf = same ?? here[0] ?? null;
                    setSubShelf(shelf?.id ?? null);
                    setSubShelfLabel(shelf?.label ?? "");
                    setSubFee(shelf ? String(shelf.openingFee) : "");
                    setSubTrial(String(chosen.trialDays));
                  }
                }}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                {(plansQ.data ?? []).filter((pl) => pl.active).map((pl) => (
                  <option key={pl.name} value={pl.name}>{pl.label} · {pl.name}</option>
                ))}
              </select>

              {/**
               * Which way they are being sold it.
               *
               * This was two buttons, Monthly and Yearly, the second disabled
               * when the plan had no yearly price. It is one button per shelf
               * the owner wrote, each showing its ladder, so whoever clicks
               * knows what the account pays after the first period as well as
               * during it.
               */}
              <label className="block text-xs font-semibold text-slate-500">Billed</label>
              {(() => {
                const chosen = (plansQ.data ?? []).find((pl) => pl.name === subPlan);
                const here = (chosen?.schedules ?? []).filter((x) => x.active);
                if (here.length === 0) {
                  return (
                    <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      This plan has no price yet — set one in the Plans tab first.
                    </p>
                  );
                }
                return (
                  <div className="space-y-1">
                    {here.map((x) => (
                      <button
                        key={x.id}
                        onClick={() => {
                          setSubShelf(x.id);
                          setSubShelfLabel(x.label);
                          setSubFee(String(x.openingFee));
                        }}
                        className={`block w-full rounded-xl px-3 py-2 text-left text-xs transition ${
                          subShelf === x.id
                            ? "bg-brand-600 text-white"
                            : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <b>{x.label}</b>
                        <span className={subShelf === x.id ? "text-white/80" : "text-slate-400"}>
                          {" — "}
                          {scheduleSentence(x.phases, money)}
                        </span>
                      </button>
                    ))}
                  </div>
                );
              })()}

              <label className="block text-xs font-semibold text-slate-500">
                First period&apos;s fee ({cur()}) — overrides the ladder once
              </label>
              <input value={subFee} onChange={(e) => setSubFee(e.target.value)} type="number" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
              <label className="block text-xs font-semibold text-slate-500">Free trial (days) — 0 for none</label>
              <input value={subTrial} onChange={(e) => setSubTrial(e.target.value)} type="number" min={0} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
              {/* this used to read "Starts with a 14-day trial" in print, which
                  stopped being true the moment the trial length became a field */}
              <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                {subTrial.trim() === ""
                  ? "Whatever this plan sells."
                  : Number(subTrial) > 0
                    ? `Free until ${dmy(new Date(Date.now() + Number(subTrial) * 86400000))}, then ${money(Number(subFee))} for the first period.`
                    : "No free trial — the first period is due today."}
              </div>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Btn variant="ghost" onClick={() => setSubFor(null)}>Cancel</Btn>
              <Btn
                disabled={busy}
                onClick={() => act(async () => { await client.platform.subscribe(subFor.id, {
                    plan: subPlan,
                    ...(subShelf == null ? {} : { scheduleId: subShelf }),
                    fee: Number(subFee),
                    // an empty box means "whatever the plan sells", not "none":
                    // Number("") is 0, and 0 is a real answer here
                    ...(subTrial.trim() === "" ? {} : { trialDays: Number(subTrial) }),
                  }); setSubFor(null); })}
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
function FeaturePicker({ chosen, onToggle, audience }: { chosen: string[]; onToggle: (key: string) => void; audience: string }) {
  // a feature belongs to one shelf: the restaurant is not a thing an agency can buy
  const shelf = PLAN_FEATURES.filter((f) => f.audience === audience);
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-semibold text-slate-500">What this plan includes</div>
      {shelf.length === 0 && (
        <div className="rounded-lg bg-slate-50 px-2 py-1.5 text-[11px] text-slate-500">
          Nothing on this shelf yet — each tool arrives with its own lock.
        </div>
      )}
      {shelf.map((f) => (
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


function toEdit(plan: PlanDefinition): PlanForm {
  return {
    label: plan.label,
    maxRooms: plan.maxRooms,
    maxResorts: plan.maxResorts,
    maxStaff: plan.maxStaff,
    trialDays: plan.trialDays,
    features: [...(plan.features ?? [])],
    blurb: plan.blurb ?? "",
    active: plan.active,
    sortOrder: plan.sortOrder,
    highlight: plan.highlight,
    audience: plan.audience ?? "RESORT",
  };
}

function PlanCard({
  plan,
  busy,
  onSave,
  onDelete,
}: {
  plan: PlanDefinition;
  busy: boolean;
  onSave: (name: string, patch: PlanEdit) => void;
  onDelete: (name: string) => void;
}) {
  const [form, setForm] = useState<PlanForm>(() => toEdit(plan));
  // a save refetches the list; re-seed the form from whatever came back
  useEffect(() => { setForm(toEdit(plan)); }, [plan]);

  const set = <K extends keyof PlanForm>(k: K, v: PlanForm[K]) => setForm((f) => ({ ...f, [k]: v }));
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
          <div className="mt-0.5 text-[10px] font-bold text-slate-500">{plan.audience === "AGENCY" ? "Agency plan" : "Resort plan"}</div>
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

        {/**
         * What this plan costs.
         *
         * There were two boxes here, "Monthly fee" and "Yearly fee", and they
         * were the platform's entire vocabulary for pricing: a quarter, a
         * three-year deal, or a free first week needed a migration. The prices
         * are rows now, and this is where they are written. Saving the ladder
         * is its own action — it is validated as a whole, and refused outright
         * if a shelf being taken down still has accounts on it.
         */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Prices
          </div>
          <PlanLadder plan={plan.name} label={plan.label} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <NumField label="Free trial (days)" value={form.trialDays} min={0} onChange={(n) => set("trialDays", n)} />
          {/* An agency owns no resorts and has no rooms, so both caps are zero
              on that shelf and mean nothing. Shown, they read as settings
              somebody ought to "fix" into numbers that gate nothing. */}
          {form.audience !== "AGENCY" && (
            <>
              <NumField label="Rooms per resort" value={form.maxRooms} min={1} onChange={(n) => set("maxRooms", n)} />
              <NumField label="Resorts per owner" value={form.maxResorts} min={1} onChange={(n) => set("maxResorts", n)} />
            </>
          )}
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

        <FeaturePicker chosen={form.features} onToggle={toggle} audience={form.audience} />

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

/** Every field the create form holds; assignable to `NewPlan` as it stands. */
const BLANK_PLAN: Required<NewPlan> = {
  name: "",
  label: "",
  price: 0,
  maxRooms: 10,
  maxResorts: 1,
  maxStaff: 1,
  trialDays: 14,
  features: [],
  blurb: "",
  active: true,
  sortOrder: 0,
  highlight: false,
  audience: "RESORT",
};

function NewPlanCard({
  busy,
  onCreate,
  taken,
}: {
  busy: boolean;
  onCreate: (body: NewPlan) => void;
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
          <span className="text-[11px] font-semibold text-slate-500">Sold to — a resort never sees an agency plan, and an agency never sees a resort plan</span>
          <select
            value={form.audience}
            // a feature belongs to one shelf, so a change of shelf clears the
            // ticks; and the room and resort caps are a resort's, so an agency
            // plan carries zero for both rather than a number gating nothing
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                audience: e.target.value,
                features: [],
                ...(e.target.value === "AGENCY"
                  ? { maxRooms: 0, maxResorts: 0 }
                  : { maxRooms: Math.max(1, f.maxRooms), maxResorts: Math.max(1, f.maxResorts) }),
              }))
            }
            className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
          >
            <option value="RESORT">Resorts</option>
            <option value="AGENCY">Travel agencies</option>
          </select>
        </label>
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

        {/**
         * A new plan gets one price and one way of buying it.
         *
         * The full ladder editor needs a plan to hang rows off, and this plan
         * does not exist yet — so the opening price is a box, the server turns
         * it into a single rung running forever, and the ladder is edited on
         * the card once it is saved. The hint below says so, because a person
         * looking for "free for a week" on this form should be told where it
         * is rather than conclude the platform cannot do it.
         */}
        <div className="grid grid-cols-2 gap-2">
          <NumField label={`Price (${cur()})`} value={form.price} min={0} onChange={(n) => set("price", n)} />
          <NumField label="Free trial (days)" value={form.trialDays} min={0} onChange={(n) => set("trialDays", n)} />
          <p className="col-span-2 -mt-1 text-[11px] text-slate-400">
            Sold monthly to begin with. Save the plan, then set as many ways of buying it as you
            like — a free first week, six months at half price, a three-year deal.
          </p>
          {form.audience !== "AGENCY" && (
            <>
              <NumField label="Rooms per resort" value={form.maxRooms} min={1} onChange={(n) => set("maxRooms", n)} />
              <NumField label="Resorts per owner" value={form.maxResorts} min={1} onChange={(n) => set("maxResorts", n)} />
            </>
          )}
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
          audience={form.audience}
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
  agent: PlatformAgentRow;
  onClose: () => void;
  onMoved: () => void;
}) {
  const { push } = useToast();
  const [view, setView] = useState<PlatformWallet | null>(null);
  const [kind, setKind] = useState("TOPUP");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    client.platform
      .wallet(agent.id)
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
      await client.platform.moveWallet(agent.id, { kind, amount: value, note: note || undefined });
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
              <Table minWidth={0} tableClassName="mt-2 text-sm">
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
              </Table>
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

function PackPricesCard() {
  const { push } = useToast();
  const [packs, setPacks] = useState<{ credits: string; price: string }[]>([]);
  const [payTo, setPayTo] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    client.platform.settings()
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
      await client.platform.updateSettings({
        "email.creditPacks": JSON.stringify(rows),
        "platform.paymentInstructions": payTo,
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
          placeholder={
            "e.g. bKash (personal) 01XXXXXXXXX — send the amount, then WhatsApp the TrxID\n" +
            "e.g. bank transfer: <account name>, <bank>, A/C <number>"
          }
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
  const [last, setLast] = useState<BillingSweepResult | null>(null);

  const load = useCallback(() => {
    client.platform.settings().then(setValues).catch(() => setValues({}));
  }, []);
  useEffect(() => load(), [load]);

  async function save() {
    setBusy(true);
    try {
      const patch = Object.fromEntries(POLICY_FIELDS.map((f) => [f.key, values[f.key] ?? ""]));
      setValues(await client.platform.updateSettings(patch));
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
      const r = await client.platform.runBillingSweep();
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
                  placeholder={f.placeholder}
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

/**
 * The platform's own brand.
 *
 * A name, a square icon for the browser tab, and a wide logo. They are CMS
 * rows, so this screen is the only place they are set — no deploy, and no
 * file checked into the repository. Empty means the built-in mark.
 */
function BrandCard() {
  const { push } = useToast();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    client.platform.cms()
      .then((rows) => {
        const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
        setName(m["brand.name"] ?? "");
        setIcon(m["brand.icon"] || null);
        setLogo(m["brand.logo"] || null);
      })
      .catch(() => {});
  }, []);
  useEffect(() => load(), [load]);

  async function save(key: string, value: string, ok: string) {
    setBusy(key);
    try {
      await client.platform.setCms(key, value);
      push(ok);
      load();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(null);
    }
  }

  async function upload(key: "brand.icon" | "brand.logo", file: File | undefined) {
    if (!file) return;
    const dataUrl = await new Promise<string | null>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => resolve(null);
      r.readAsDataURL(file);
    });
    if (!dataUrl) {
      push("That file could not be read", "err");
      return;
    }
    await save(key, dataUrl, key === "brand.icon" ? "Icon saved — reload to see the browser tab change" : "Logo saved — reload to see it");
  }

  const filePicker = (key: "brand.icon" | "brand.logo", label: string) => (
    <label className="inline-flex cursor-pointer items-center rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
      {busy === key ? "Saving…" : label}
      <input
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp,image/x-icon"
        className="hidden"
        onChange={(e) => {
          void upload(key, e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </label>
  );

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-lg font-bold text-slate-900">
        <Globe className="h-5 w-5 text-brand-500" /> Brand
      </div>
      <p className="mt-1 text-xs text-slate-500">
        The name, the browser-tab icon and the logo. Set here, used everywhere — no deploy. Leave a thing empty and the
        built-in mark is used.
      </p>

      <div className="mt-4 flex items-end gap-2">
        <label className="flex-1">
          <span className="text-xs font-semibold text-slate-500">Platform name <code className="text-[10px] text-slate-300">brand.name</code></span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Resort Mela"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <Btn size="sm" loading={busy === "brand.name"} onClick={() => save("brand.name", name, "Name saved")}>Save</Btn>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div>
          <div className="text-xs font-semibold text-slate-500">Icon — the browser tab, and the tile in the sidebar</div>
          <div className="mt-2 flex items-center gap-3">
            {icon ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={icon} alt="" className="h-12 w-12 rounded-[22%] object-contain ring-1 ring-slate-200" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={icon} alt="" className="h-4 w-4 rounded-[22%] object-contain" />
              </>
            ) : (
              <span className="text-xs text-slate-400">Using the built-in mark</span>
            )}
          </div>
          <div className="mt-2 flex gap-2">
            {filePicker("brand.icon", icon ? "Replace…" : "Upload…")}
            {icon && (
              <button
                onClick={() => void save("brand.icon", "", "Back to the built-in mark")}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Use the default
              </button>
            )}
          </div>
          <div className="mt-1 text-[10px] text-slate-400">Square, SVG or PNG. Up to ~70KB.</div>
        </div>

        <div>
          <div className="text-xs font-semibold text-slate-500">Logo — replaces the mark and name together</div>
          <div className="mt-2 flex items-center gap-3">
            {logo ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logo} alt="" className="h-8 w-auto" />
                <span className="rounded-lg bg-brand-900 px-3 py-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logo} alt="" className="h-6 w-auto" />
                </span>
              </>
            ) : (
              <span className="text-xs text-slate-400">Using the built-in lockup</span>
            )}
          </div>
          <div className="mt-2 flex gap-2">
            {filePicker("brand.logo", logo ? "Replace…" : "Upload…")}
            {logo && (
              <button
                onClick={() => void save("brand.logo", "", "Back to the built-in lockup")}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Use the default
              </button>
            )}
          </div>
          <div className="mt-1 text-[10px] text-slate-400">Wide, on a transparent background. Up to ~190KB.</div>
        </div>
      </div>
    </Card>
  );
}

function CmsTab() {
  const { push } = useToast();
  const [rows, setRows] = useState<CmsRow[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    client.platform.cms().then((r) => {
      setRows(r);
      setValues(Object.fromEntries(r.map((x) => [x.key, x.value])));
    }).catch(() => setRows([]));
  }, []);
  useEffect(() => load(), [load]);

  async function save(key: string) {
    setBusy(key);
    try {
      await client.platform.setCms(key, values[key] ?? "");
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
      <BrandCard />
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
