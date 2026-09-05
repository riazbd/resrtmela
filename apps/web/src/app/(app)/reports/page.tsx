"use client";

import { useCallback, useEffect, useState } from "react";
import { api, bdt, dmy } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Badge, Button, Card, Empty, Field, Input, Select, Spinner, Td, Th, useToast } from "@/components/ui";

interface AgentRow {
  agentId: number; name: string; commissionRate: number;
  bookings: number; rent: number; due: number; commission: number;
}
interface SourceRow { source: string; bookings: number; rent: number; due: number }
interface CollectorRow {
  userId: number | null; name: string; advances: number; total: number; codes: string[];
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

function isoDays(offset: number) {
  return new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
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

export default function ReportsPage() {
  const { activeResort, isStaff, isManagement } = useAuth();
  const { push } = useToast();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [agents, setAgents] = useState<AgentRow[] | null>(null);
  const [sources, setSources] = useState<SourceRow[] | null>(null);
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [daily, setDaily] = useState<DailyRow[] | null>(null);
  const [collectors, setCollectors] = useState<Collectors | null>(null);
  const [fyList, setFyList] = useState<FiscalYear[]>([]);
  const [fy, setFy] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeResort) return;
    setLoading(true);
    try {
      const qs = from && to ? `&from=${from}&to=${to}` : "";
      const [a, s] = await Promise.all([
        api<{ rows: AgentRow[] }>(`/resorts/${activeResort.id}/reports/agents?1=1${qs}`),
        api<{ rows: SourceRow[] }>(`/resorts/${activeResort.id}/reports/sources?1=1${qs}`),
      ]);
      setAgents(a.rows);
      setSources(s.rows);
      setCollectors(await api<Collectors>(`/resorts/${activeResort.id}/reports/collectors?1=1${qs}`));
      setMetrics(await api<Metrics>(`/resorts/${activeResort.id}/metrics?1=1${qs}`));
      setDaily(
        await api<DailyRow[]>(
          `/resorts/${activeResort.id}/reports/daily?from=${from || isoDays(-7)}&to=${to || isoDays(1)}`,
        ),
      );
      if (isManagement) {
        setAudit(await api<AuditRow[]>(`/resorts/${activeResort.id}/audit?take=60`));
      }
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setLoading(false);
    }
  }, [activeResort, from, to, isManagement, push]);

  useEffect(() => {
    if (!activeResort) return;
    api<{ years: FiscalYear[] }>(`/resorts/${activeResort.id}/fiscal-years`)
      .then((r) => setFyList(r.years))
      .catch(() => {});
  }, [activeResort]);

  useEffect(() => {
    if (isStaff) void load();
  }, [load, isStaff]);

  if (!isStaff) return <Empty msg="Staff only" />;
  if (loading) return <Spinner />;

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
              const y = fyList.find((x) => x.label === e.target.value);
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

      {collectors && collectors.rows.length > 0 && (
        <Card title="Advance collectors (who received cash)">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {collectors.rows.map((r) => (
              <div key={r.userId ?? "x"} className="rounded-lg border border-slate-200 p-3">
                <div className="text-sm font-semibold">{r.name}</div>
                <div className="text-xs text-slate-400">{r.advances} advance(s)</div>
                <div className="mt-1 text-lg font-bold text-brand-700">{bdt(r.total)}</div>
                <div className="mt-1 text-[10px] text-slate-400">
                  {r.codes.slice(0, 6).join(", ")}{r.codes.length > 6 ? "…" : ""}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {metrics && (
        <Card title="P&L summary (management metrics)">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MiniBox label="Resort revenue" value={bdt(metrics.resortRevenue)} />
            <MiniBox label="Discount" value={bdt(metrics.discount)} />
            <MiniBox label="Net room revenue" value={bdt(metrics.netRoomRevenue)} />
            <MiniBox label="Restaurant revenue" value={bdt(metrics.restaurantRevenue)} />
            <MiniBox label="Gross income" value={bdt(metrics.grossIncome)} tone="green" />
            <MiniBox label="Expenses" value={bdt(metrics.expenses)} tone="red" />
            <MiniBox label="NET PROFIT" value={bdt(metrics.netProfit)} tone={metrics.netProfit >= 0 ? "green" : "red"} />
          </div>
        </Card>
      )}

      <Card title="Agent performance & commission" className="!p-0">
        {!agents || agents.length === 0 ? (
          <Empty msg="No agent bookings in this period" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="border-b border-slate-100">
                <tr><Th>Agent</Th><Th>Rate</Th><Th>Bookings</Th><Th className="text-right">Rent sold</Th><Th className="text-right">Dues</Th><Th className="text-right">Commission</Th></tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {agents.map((r) => (
                  <tr key={r.agentId}>
                    <Td className="font-medium">{r.name}</Td>
                    <Td className="text-xs">{r.commissionRate}%</Td>
                    <Td>{r.bookings}</Td>
                    <Td className="text-right">{bdt(r.rent)}</Td>
                    <Td className="text-right text-red-700">{bdt(r.due)}</Td>
                    <Td className="text-right font-bold text-green-700">{bdt(r.commission)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Booking sources" className="!p-0">
        {!sources || sources.length === 0 ? (
          <Empty msg="No bookings in this period" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px]">
              <thead className="border-b border-slate-100">
                <tr><Th>Source</Th><Th>Bookings</Th><Th className="text-right">Rent</Th><Th className="text-right">Dues</Th></tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sources.map((r) => (
                  <tr key={r.source}>
                    <Td><Badge value={r.source} /></Td>
                    <Td>{r.bookings}</Td>
                    <Td className="text-right">{bdt(r.rent)}</Td>
                    <Td className="text-right text-red-700">{bdt(r.due)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {daily && daily.length > 0 && (
        <Card title="Daily revenue" className="!p-0">
          <div className="max-h-64 overflow-auto">
            <table className="w-full min-w-[520px]">
              <thead className="sticky top-0 border-b border-slate-100 bg-white">
                <tr><Th>Date</Th><Th className="text-right">Rooms</Th><Th className="text-right">F&B</Th><Th className="text-right">Expenses</Th><Th className="text-right">Net</Th></tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {daily.map((d) => (
                  <tr key={d.date}>
                    <Td className="text-xs">{d.date}</Td>
                    <Td className="text-right">{bdt(d.roomRevenue)}</Td>
                    <Td className="text-right">{bdt(d.fbRevenue)}</Td>
                    <Td className="text-right text-red-700">{bdt(d.expenses)}</Td>
                    <Td className="text-right font-semibold">{bdt(d.net)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {isManagement && (
        <Card title="Audit trail" className="!p-0">
          {!audit || audit.length === 0 ? (
            <Empty msg="No audit entries yet" />
          ) : (
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full min-w-[680px]">
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
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
