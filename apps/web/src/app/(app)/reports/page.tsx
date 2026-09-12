"use client";

import { useState } from "react";
import { client, money, dmy, type PLReport } from "@/lib/api";
import { useApi, keys } from "@/lib/query";
import { ErrorState, Skeleton } from "@/components/error-state";
import { useAuth } from "@/lib/auth";
import { Badge, Button, Card, Empty, Field, Input, Select, Td, Th } from "@/components/ui";
import { Tabs, Table } from "@/components/patterns";
import { todayIn, addDaysIso } from "@/lib/resort-dates";

interface AgentRow {
  agentId: number; name: string; commissionRate: number; commissionKind: string;
  bookings: number; rent: number; due: number; commission: number;
}
interface SourceRow { source: string; bookings: number; rent: number; due: number }
interface CollectorRow {
  userId: number | null; name: string; advances: number; total: number;
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
  rows: CollectorRow[];
  recent: { id: number; at: string; amount: number; method: string; bookingCode: string; guest: string; receivedBy: string | null }[];
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
const REPORT_TABS = ["Summary", "Profit & loss", "Agents", "Sources", "Daily", "Audit trail"] as const;
type ReportTab = (typeof REPORT_TABS)[number];

export default function ReportsPage() {
  const { activeResort, isStaff, isManagement } = useAuth();
  const [tab, setTab] = useState<ReportTab>("Summary");
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
  const collectorsQ = useApi(keys.reports(rid, "collectors", period), () => client.reports.collectors(rid!, range) as Promise<Collectors>, { enabled, placeholderData: (prev) => prev });
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
      <Card
        title="Report period"
        action={
          <Button size="sm" variant="ghost" onClick={() => { setFrom(""); setTo(""); }}>Clear</Button>
        }
      >
        <div className="flex items-end gap-3">
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

      <Tabs tabs={visibleTabs} value={tab} onChange={setTab} />

      {tab === "Summary" && collectors && collectors.rows.length > 0 && (
        <Card title="Advance collectors (who received cash)">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {collectors.rows.map((r) => (
              <div key={r.userId ?? "x"} className="rounded-lg border border-slate-200 p-3">
                <div className="text-sm font-semibold">{r.name}</div>
                <div className="text-xs text-slate-400">{r.advances} advance(s)</div>
                <div className="mt-1 text-lg font-bold text-brand-700">{money(r.total)}</div>
                <div className="mt-1 text-[10px] text-slate-400">
                  {(r.recentCodes ?? []).slice(0, 6).join(", ")}
                  {(r.recentCodes ?? []).length > 6 ? "…" : ""}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

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
