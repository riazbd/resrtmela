"use client";

import { useState } from "react";
import { client, money, dmy, type PLReport } from "@/lib/api";
import { useApi, keys } from "@/lib/query";
import { ErrorState, Skeleton } from "@/components/error-state";
import { useAuth } from "@/lib/auth";
import { Badge, Button, Card, Empty, Field, Input, Select, Td, Th } from "@/components/ui";
import { Tabs, Table } from "@/components/patterns";
import { todayIn, addDaysIso } from "@/lib/resort-dates";
import { methodLabel } from "@rh/shared";

interface AgentRow {
  agentId: number; name: string; commissionRate: number; commissionKind: string;
  bookings: number; rent: number; due: number; commission: number;
}
interface SourceRow { source: string; bookings: number; rent: number; due: number }
interface CollectorRow {
  userId: number | null; name: string; count: number; total: number;
  /**
   * True when the name came out of an imported spreadsheet rather than an
   * account. The two are different claims — the app recording who pressed the
   * button, against the owner writing a name in a column — and a card that
   * showed them identically would overstate what the report knows.
   */
  fromSheet?: boolean;
  /**
   * A sample of the bookings behind the total, not all of them.
   *
   * This was `codes`, and the report stopped sending it when the totals moved
   * into the database — so the card below read `undefined.slice()` and the
   * whole Reports page went to the error boundary. Optional here as well as
   * present there: no screen should be one renamed field away from showing
   * nothing at all.
   */
  recentCodes?: string[];
}
interface Collectors {
  /** the period's whole take, so the cards never have to be added up by eye */
  total: number;
  /**
   * How the money arrived. With no payment gateway this is half the question:
   * cash is in a drawer and has to be counted tonight, bKash and a bank
   * transfer are somebody else's statement and have to be matched against it.
   */
  /** `method` is null for receipts imported before a method column existed */
  byMethod: { method: string | null; count: number; total: number }[];
  rows: CollectorRow[];
  recent: { id: number; at: string; amount: number; method: string | null; bookingCode: string; guest: string; type: string; receivedBy: string | null; fromSheet?: boolean }[];
}
interface FiscalYear { label: string; from: string; to: string }
interface Metrics {
  resortRevenue: number; discount: number; netRoomRevenue: number;
  restaurantRevenue: number; grossIncome: number; expenses: number; netProfit: number;
  bookings: number;
}
interface DailyRow { date: string; roomRevenue: number; fbRevenue: number; expenses: number; net: number }
interface AuditRow {
  id: string; actor: string; role: string | null; action: string;
  entity: string; entityId: string | null; diff: unknown; at: string;
}



function MiniBox({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "green" | "red" }) {
  const tones = { default: "text-slate-900", green: "text-green-700", red: "text-red-700" };
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="text-[10px] font-medium uppercase text-slate-400">{label}</div>
      <div className={`text-base font-bold ${tones[tone]}`}>{value}</div>
    </div>
  );
}

function PLRow({ label, value, tone = "default", bold = false, muted = false }: { label: string; value: number; tone?: "default" | "green" | "red"; bold?: boolean; muted?: boolean }) {
  const tones = { default: "text-slate-800", green: "text-green-700", red: "text-red-700" };
  return (
    <div className={`flex items-center justify-between py-0.5 ${bold ? "mt-0.5" : ""}`}>
      <span className={`${muted ? "text-[11px] text-slate-400" : "text-xs text-slate-600"} ${bold ? "font-bold text-slate-900" : ""}`}>{label}</span>
      <span className={`${bold ? "text-sm font-bold" : "text-xs font-semibold"} ${tones[tone]}`}>{money(value)}</span>
    </div>
  );
}

/**
 * Seven reports, one scroll.
 *
 * They were stacked down a single page: the P&L summary, the statement, agents,
 * sources, the daily grid and the audit trail, one after another, so reading
 * the third meant scrolling past the first two every time. They are not a
 * sequence — nobody reads a booking-source table on the way to a P&L — so a
 * tab per report is what the page always wanted.
 *
 * The period picker stays above the tabs, because it is the one control that
 * belongs to all of them.
 */
const REPORT_TABS = ["Money", "Summary", "Profit & loss", "Agents", "Sources", "Daily", "Audit trail"] as const;
type ReportTab = (typeof REPORT_TABS)[number];

export default function ReportsPage() {
  const { activeResort, isStaff, isManagement } = useAuth();
  const [tab, setTab] = useState<ReportTab>("Money");

  /**
   * The money tab keeps its own dates.
   *
   * The card above is labelled "Check-in from/to" and the rest of this page
   * means it — but this report filters on when the money *arrived*, and a stay
   * in September and a payment in September are not the same set. An owner
   * counting a drawer means the second, so it asks its own question in its own
   * words rather than borrowing one that is wrong for it.
   */
  const [moneyFrom, setMoneyFrom] = useState("");
  const [moneyTo, setMoneyTo] = useState("");
  // the resort's day, not the browser's: after 18:00 in Dhaka these differ
  const today = todayIn(activeResort?.timezone);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [fy, setFy] = useState("");

  /**
   * Seven reports, seven independent queries.
   *
   * They used to run one after another inside a single loader — agents and
   * sources in parallel, then collectors, then metrics, then the daily grid,
   * then the P&L, then the audit log, each waiting on the one before it. On
   * the connection a hill resort actually has, that is seven round trips
   * stacked end to end before anything appears. Now they run together, each
   * arrives when it arrives, and each is cached under its own period.
   */
  const rid = activeResort?.id;
  const enabled = isStaff && !!activeResort;
  const range = { from: from || undefined, to: to || undefined };
  const period = `${from}:${to}`;

  const agentsQ = useApi(keys.reports(rid, "agents", period), () => client.reports.agents(rid!, range) as Promise<{ rows: AgentRow[] }>, { enabled, placeholderData: (prev) => prev });
  const sourcesQ = useApi(keys.reports(rid, "sources", period), () => client.reports.sources(rid!, range) as Promise<{ rows: SourceRow[] }>, { enabled, placeholderData: (prev) => prev });
  const moneyRange = { from: moneyFrom || undefined, to: moneyTo || undefined };
  const collectorsQ = useApi(
    keys.reports(rid, "collectors", `${moneyFrom}:${moneyTo}`),
    () => client.reports.collectors(rid!, moneyRange) as Promise<Collectors>,
    { enabled, placeholderData: (prev) => prev },
  );
  const metricsQ = useApi(keys.reports(rid, "metrics", period), () => client.reports.metrics(rid!, range) as Promise<Metrics>, { enabled, placeholderData: (prev) => prev });
  // the three heavy reads wait until their tab is open; the four light ones
  // stay eager because the page's own loading and error states read them
  const dailyQ = useApi(
    keys.reports(rid, "daily", period),
    () => client.reports.daily(rid!, from || addDaysIso(today, -7), to || addDaysIso(today, 1)) as Promise<DailyRow[]>,
    { enabled: enabled && tab === "Daily", placeholderData: (prev) => prev },
  );
  const plQ = useApi(
    keys.reports(rid, "pl", period),
    () => client.reports.pl(rid!, from || addDaysIso(today, -90), to || addDaysIso(today, 1)),
    { enabled: enabled && tab === "Profit & loss", placeholderData: (prev) => prev },
  );
  const auditQ = useApi(keys.reports(rid, "audit"), () => client.reports.audit(rid!, 60) as Promise<AuditRow[]>, {
    enabled: enabled && isManagement && tab === "Audit trail",
  });
  // the financial-year list is a property of the resort, not of the period
  const fyQ = useApi(keys.reports(rid, "fiscal-years"), () => client.resort.fiscalYears(rid!) as Promise<{ years: FiscalYear[] }>, {
    enabled,
    staleTime: 3_600_000,
  });

  const agents: AgentRow[] | null = agentsQ.data?.rows ?? null;
  const sources: SourceRow[] | null = sourcesQ.data?.rows ?? null;
  const collectors: Collectors | null = collectorsQ.data ?? null;
  const metrics: Metrics | null = metricsQ.data ?? null;
  const daily: DailyRow[] | null = dailyQ.data ?? null;
  const pl: PLReport | null = plQ.data ?? null;
  const audit: AuditRow[] | null = auditQ.data ?? null;
  const fyList: FiscalYear[] = fyQ.data?.years ?? [];
  const visibleTabs = REPORT_TABS.filter((t) => t !== "Audit trail" || isManagement);
  const loading = agentsQ.isPending || sourcesQ.isPending || metricsQ.isPending;
  const error = agentsQ.error ?? sourcesQ.error ?? metricsQ.error ?? collectorsQ.error;

  if (!isStaff) return <Empty msg="Staff only" />;
  if (error) return <ErrorState error={error} />;
  if (loading) return <Skeleton rows={6} />;

  return (
    <div className="space-y-6">
      {/*
        Hidden on the Money tab, which asks its own question with its own
        dates. Two date pickers on one screen, one of which does nothing to
        what is shown, is worse than none.
      */}
      {tab !== "Money" && (
      <Card
        title="Report period"
        action={
          <Button size="sm" variant="ghost" onClick={() => { setFrom(""); setTo(""); }}>Clear</Button>
        }
      >
        {/* three date controls do not fit side by side on a phone, and a row
            that cannot wrap drags the page instead of stacking */}
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Financial year">
          <Select
            value={fy}
            onChange={(e) => {
              // the options carry `y.from` as their value and this looked the
              // year up by `label`, so it never matched: choosing "FY 2025-26"
              // showed it selected and quietly reported all time instead
              const y = fyList.find((x) => x.from === e.target.value);
              setFy(e.target.value);
              if (y) { setFrom(y.from); setTo(y.to); } else { setFrom(""); setTo(""); }
            }}
            className="!w-44"
          >
            <option value="">All time</option>
            {fyList.map((y) => (
              <option key={y.label} value={y.from}>
                {y.label} ({y.from.slice(0, 4)}–{y.to.slice(0, 4)})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Check-in from"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Check-in to"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
      </Card>
      )}

      <Tabs tabs={visibleTabs} value={tab} onChange={setTab} />

      {tab === "Money" && (
        <Card title="Money received">
          {/*
            Its own dates, and its own words for them: this is when the money
            arrived, not when the guest does. The three shortcuts are the three
            questions anybody actually brings — what came in today, this month,
            and since the beginning.
          */}
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <Field label="Received from">
              <Input type="date" value={moneyFrom} onChange={(e) => setMoneyFrom(e.target.value)} />
            </Field>
            <Field label="Received to">
              <Input type="date" value={moneyTo} onChange={(e) => setMoneyTo(e.target.value)} />
            </Field>
            <div className="flex gap-1.5 pb-0.5">
              {([
                ["Today", today, addDaysIso(today, 1)],
                ["This month", `${today.slice(0, 7)}-01`, addDaysIso(today, 1)],
                ["All time", "", ""],
              ] as const).map(([label, f, t]) => (
                <button
                  key={label}
                  onClick={() => { setMoneyFrom(f); setMoneyTo(t); }}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                    moneyFrom === f && moneyTo === t
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {!collectors ? (
            <Empty msg="Loading…" />
          ) : collectors.recent.length === 0 && collectors.rows.length === 0 ? (
            <Empty msg="No money was received in this period" />
          ) : (
            <>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Received in this period
              </div>
              <div className="text-3xl font-bold text-brand-700">{money(collectors.total)}</div>

              {/*
                How it arrived, before who took it. Cash has to be counted
                tonight; bKash and a bank transfer have to be matched against
                somebody else's statement. One number for both is an average,
                not a reconciliation.
              */}
              {collectors.byMethod.length > 0 && (
                <div className="mt-4">
                  <div className="mb-1.5 text-xs font-semibold text-slate-500">How it arrived</div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {collectors.byMethod.map((m) => (
                      <div
                        key={m.method ?? "unrecorded"}
                        className={`rounded-lg border p-3 ${m.method ? "border-slate-200" : "border-dashed border-slate-300 bg-slate-50"}`}
                      >
                        <div className={`text-xs font-semibold ${m.method ? "text-slate-600" : "text-slate-500"}`}>
                          {methodLabel(m.method)}
                        </div>
                        <div className="text-[11px] text-slate-400">{m.count} payment(s)</div>
                        <div className="mt-1 text-lg font-bold text-slate-800">{money(m.total)}</div>
                        {/*
                          A dashed card, because this is a gap and not a
                          channel. These are rows an import created before the
                          sheet had a method column — every one of them used to
                          say CASH, which was the column default and not
                          anything anybody wrote down.
                        */}
                        {!m.method && (
                          <div className="mt-1 text-[10px] leading-snug text-slate-400">
                            imported before a method was recorded
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4">
                <div className="mb-1.5 text-xs font-semibold text-slate-500">Who took it</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {collectors.rows.map((r) => (
                    <div
                      key={r.userId != null ? `u${r.userId}` : `s${r.name}`}
                      className="rounded-lg border border-slate-200 p-3"
                    >
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-sm font-semibold">{r.name}</span>
                        {r.fromSheet && (
                          <span
                            className="rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-500"
                            title="This name came from your imported spreadsheet, not from an account in the app"
                          >
                            from the sheet
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400">{r.count} payment(s)</div>
                      <div className="mt-1 text-lg font-bold text-brand-700">{money(r.total)}</div>
                      <div className="mt-1 text-[10px] text-slate-400">
                        {(r.recentCodes ?? []).slice(0, 6).join(", ")}
                        {(r.recentCodes ?? []).length > 6 ? "…" : ""}
                      </div>
                    </div>
                  ))}
                </div>
                {/*
                  Said once, under the cards, because "Unassigned" holding every
                  taka in the resort is alarming until you know why — and the
                  reason is not a fault: a spreadsheet has no column for who
                  took the cash, so the importer refused to invent one.
                */}
                {collectors.rows.some((r) => r.fromSheet) && (
                  <p className="mt-2 text-xs text-slate-500">
                    <b>From the sheet</b> means the name your spreadsheet recorded in its
                    &quot;Received By&quot; column. Nobody by that name has an account here, so the
                    app cannot confirm it — it is your own record, shown as such.
                  </p>
                )}
                {collectors.rows.some((r) => r.name === "Unassigned") && (
                  <p className="mt-2 text-xs text-slate-500">
                    <b>Unassigned</b> is money that arrived with no name against it at all — an
                    import whose receiver column was blank or absent. Anything recorded in the app
                    carries the name of whoever entered it.
                  </p>
                )}
              </div>

              {collectors.recent.length > 0 && (
                <div className="mt-5">
                  <div className="mb-1.5 text-xs font-semibold text-slate-500">
                    Receipts ({collectors.recent.length}
                    {collectors.recent.length >= 300 ? ", most recent" : ""})
                  </div>
                  <Table minWidth={720}>
                    <thead className="border-b border-slate-100">
                      <tr>
                        <Th>When</Th>
                        <Th>Who took it</Th>
                        <Th>From</Th>
                        <Th>For</Th>
                        <Th>How</Th>
                        <Th className="text-right">Amount</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {collectors.recent.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/50">
                          <Td className="whitespace-nowrap text-xs text-slate-500">{dmy(p.at)}</Td>
                          <Td className="text-xs">
                            {p.receivedBy ? (
                              <>
                                {p.receivedBy}
                                {p.fromSheet && (
                                  <span className="ml-1 text-[10px] text-slate-400">(sheet)</span>
                                )}
                              </>
                            ) : (
                              <span className="text-slate-400">not recorded</span>
                            )}
                          </Td>
                          <Td className="text-xs">{p.guest}</Td>
                          <Td className="text-xs text-slate-500">{p.bookingCode}</Td>
                          <Td className={`text-xs ${p.method ? "text-slate-500" : "text-slate-400"}`}>
                            {methodLabel(p.method)}
                          </Td>
                          <Td className={`text-right text-xs font-semibold ${p.type === "REFUND" ? "text-red-600" : ""}`}>
                            {p.type === "REFUND" ? `− ${money(p.amount)}` : money(p.amount)}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {/*
        "Who received money" used to be here, above the P&L boxes, with the
        page's own "Check-in from/to" filter — which this report does not
        honour. It has its own tab and its own dates now. One copy, because two
        would drift.
      */}
      {tab === "Summary" && metrics && (
        <Card title="P&L summary (management metrics)">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MiniBox label="Resort revenue" value={money(metrics.resortRevenue)} />
            <MiniBox label="Discount" value={money(metrics.discount)} />
            <MiniBox label="Net room revenue" value={money(metrics.netRoomRevenue)} />
            <MiniBox label="Restaurant revenue" value={money(metrics.restaurantRevenue)} />
            <MiniBox label="Gross income" value={money(metrics.grossIncome)} tone="green" />
            <MiniBox label="Expenses" value={money(metrics.expenses)} tone="red" />
            <MiniBox label="NET PROFIT" value={money(metrics.netProfit)} tone={metrics.netProfit >= 0 ? "green" : "red"} />
          </div>
        </Card>
      )}

      {tab === "Profit & loss" && !pl && <Card title="Profit & Loss statement"><Empty msg="Loading…" /></Card>}
      {tab === "Profit & loss" && pl && (
        <Card title={`Profit & Loss statement (${pl.from} → ${pl.to})`}>
          <div className="grid gap-4 lg:grid-cols-3">
            {/* resort column */}
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="mb-2 text-sm font-bold text-slate-800">Resort</div>
              <PLRow label="Room revenue" value={pl.resort.roomRevenue} />
              <PLRow label="Extra person" value={pl.resort.extraPersonRevenue} />
              <PLRow label="Activities & other" value={pl.resort.otherRevenue} />
              <PLRow label="Discounts" value={-pl.resort.discounts} tone="red" />
              <PLRow label="Income" value={pl.resort.income} bold />
              <div className="my-2 border-t border-dashed border-slate-200" />
              <PLRow label="Operating expenses" value={-pl.resort.expenses} tone="red" />
              {pl.resort.expenseCategories.slice(0, 4).map((c) => (
                <PLRow key={c.category} label={`· ${c.category}`} value={-c.amount} muted />
              ))}
              <PLRow label="Payroll" value={-pl.resort.payroll} tone="red" />
              <div className="my-2 border-t border-slate-300" />
              <PLRow label="RESORT NET" value={pl.resort.net} bold tone={pl.resort.net >= 0 ? "green" : "red"} />
            </div>

            {/* restaurant column */}
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="mb-2 text-sm font-bold text-slate-800">Restaurant</div>
              <PLRow label="F&B sales" value={pl.restaurant.revenue} />
              <PLRow label="Income" value={pl.restaurant.revenue} bold />
              <div className="my-2 border-t border-dashed border-slate-200" />
              <PLRow label="Restaurant expenses" value={-pl.restaurant.expenses} tone="red" />
              {pl.restaurant.expenseCategories.slice(0, 4).map((c) => (
                <PLRow key={c.category} label={`· ${c.category}`} value={-c.amount} muted />
              ))}
              <div className="my-2 border-t border-slate-300" />
              <PLRow label="RESTAURANT NET" value={pl.restaurant.net} bold tone={pl.restaurant.net >= 0 ? "green" : "red"} />
            </div>

            {/* combined column */}
            <div className="rounded-xl border-2 border-brand-200 bg-brand-50/40 p-4">
              <div className="mb-2 text-sm font-bold text-slate-800">Combined</div>
              <PLRow label="Total income" value={pl.combined.income} bold />
              <PLRow label="Total expenses (incl. payroll)" value={-pl.combined.expenses} tone="red" />
              <div className="my-2 border-t border-slate-300" />
              <PLRow label="NET PROFIT" value={pl.combined.net} bold tone={pl.combined.net >= 0 ? "green" : "red"} />
            </div>
          </div>
        </Card>
      )}

      {tab === "Agents" && (
      <Card title="Agent performance & commission" className="!p-0">
        {!agents || agents.length === 0 ? (
          <Empty msg="No agent bookings in this period" />
        ) : (
          <Table minWidth={640}>
              <thead className="border-b border-slate-100">
                <tr><Th>Agent</Th><Th>Rate</Th><Th>Bookings</Th><Th className="text-right">Rent sold</Th><Th className="text-right">Dues</Th><Th className="text-right">Commission</Th></tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {agents.map((r) => (
                  <tr key={r.agentId}>
                    <Td className="font-medium">{r.name}</Td>
                    <Td className="text-xs">{r.commissionKind === "FLAT" ? `${money(r.commissionRate)}/booking` : `${r.commissionRate}%`}</Td>
                    <Td>{r.bookings}</Td>
                    <Td className="text-right">{money(r.rent)}</Td>
                    <Td className="text-right text-red-700">{money(r.due)}</Td>
                    <Td className="text-right font-bold text-green-700">{money(r.commission)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
        )}
      </Card>
      )}

      {tab === "Sources" && (
      <Card title="Booking sources" className="!p-0">
        {!sources || sources.length === 0 ? (
          <Empty msg="No bookings in this period" />
        ) : (
          <Table minWidth={520}>
              <thead className="border-b border-slate-100">
                <tr><Th>Source</Th><Th>Bookings</Th><Th className="text-right">Rent</Th><Th className="text-right">Dues</Th></tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sources.map((r) => (
                  <tr key={r.source}>
                    <Td><Badge value={r.source} /></Td>
                    <Td>{r.bookings}</Td>
                    <Td className="text-right">{money(r.rent)}</Td>
                    <Td className="text-right text-red-700">{money(r.due)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
        )}
      </Card>
      )}

      {tab === "Daily" && (!daily || daily.length === 0) && (
        <Card title="Daily revenue"><Empty msg="Nothing in this period" /></Card>
      )}
      {tab === "Daily" && daily && daily.length > 0 && (
        <Card title="Daily revenue" className="!p-0">
          <div className="max-h-64 overflow-auto">
            <Table minWidth={520}>
              <thead className="sticky top-0 border-b border-slate-100 bg-white">
                <tr><Th>Date</Th><Th className="text-right">Rooms</Th><Th className="text-right">F&B</Th><Th className="text-right">Expenses</Th><Th className="text-right">Net</Th></tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {daily.map((d) => (
                  <tr key={d.date}>
                    <Td className="text-xs">{d.date}</Td>
                    <Td className="text-right">{money(d.roomRevenue)}</Td>
                    <Td className="text-right">{money(d.fbRevenue)}</Td>
                    <Td className="text-right text-red-700">{money(d.expenses)}</Td>
                    <Td className="text-right font-semibold">{money(d.net)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>
      )}

      {tab === "Audit trail" && isManagement && (
        <Card title="Audit trail" className="!p-0">
          {!audit || audit.length === 0 ? (
            <Empty msg="No audit entries yet" />
          ) : (
            <div className="max-h-[420px] overflow-auto">
              <Table minWidth={680}>
                <thead className="sticky top-0 border-b border-slate-100 bg-white">
                  <tr><Th>When</Th><Th>Actor</Th><Th>Action</Th><Th>Entity</Th></tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {audit.map((r) => (
                    <tr key={r.id}>
                      <Td className="whitespace-nowrap text-xs text-slate-400">
                        {dmy(r.at)} {new Date(r.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      </Td>
                      <Td className="text-xs">{r.actor}</Td>
                      <Td className="text-xs font-medium">{r.action}</Td>
                      <Td className="text-xs text-slate-500">{r.entity}{r.entityId ? `#${r.entityId}` : ""}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
