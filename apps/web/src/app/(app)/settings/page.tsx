"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Card, Empty, Field, Input, Select, useToast } from "@/components/ui";

interface ResortDetail {
  id: number;
  name: string;
  location: string | null;
  timezone: string;
  currency: string;
  showRatesToAgents: boolean;
  taxRatePct: string | number;
  invoicePrefix: string;
  checkInTime: string;
  checkOutTime: string;
  address: string | null;
  website: string | null;
  contactPhone: string | null;
  fyStartMonthDay: string;
  _count?: { bookings: number; guests: number };
}

interface Usage {
  tenantId: number;
  name: string;
  plan: string;
  planLabel: string;
  limits: { maxResorts: number; maxRoomsPerResort: number };
  resorts: number;
  rooms: number;
  staffUsers: number;
  guests: number;
}

export default function SettingsPage() {
  const { activeResort, isManagement, role } = useAuth();
  const { push } = useToast();
  const [d, setD] = useState<ResortDetail | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!activeResort) return;
    api<ResortDetail>(`/resorts/${activeResort.id}`).then(setD);
    api<Usage>(`/tenants/${activeResort.tenantId}/usage`).then(setUsage).catch(() => {});
  }, [activeResort]);

  if (!isManagement) return <Empty msg="Managers & admins only" />;
  if (!d) return <Empty msg="Loading…" />;

  async function save() {
    if (!d) return;
    setBusy(true);
    try {
      await api(`/resorts/${d.id}`, {
        method: "PATCH",
        body: {
          name: d.name,
          location: d.location ?? undefined,
          showRatesToAgents: d.showRatesToAgents,
          taxRatePct: Number(d.taxRatePct) || 0,
          invoicePrefix: d.invoicePrefix || undefined,
          checkInTime: d.checkInTime || undefined,
          checkOutTime: d.checkOutTime || undefined,
          address: d.address ?? undefined,
          website: d.website ?? undefined,
          contactPhone: d.contactPhone ?? undefined,
          fyStartMonthDay: d.fyStartMonthDay || undefined,
        },
      });
      push("Settings saved");
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function changePlan(plan: string) {
    if (!usage) return;
    try {
      await api(`/tenants/${usage.tenantId}/plan`, { method: "PATCH", body: { plan } });
      push(`Plan changed to ${plan}`);
      setUsage({ ...usage, plan, planLabel: plan });
    } catch (ex) {
      push((ex as Error).message, "err");
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      {usage && (
        <Card title={`Plan — ${usage.planLabel}`}>
          <div className="grid grid-cols-4 gap-3 text-center">
            <Stat label="Resorts" value={`${usage.resorts}/${usage.limits.maxResorts}`} />
            <Stat label="Rooms" value={String(usage.rooms)} sub={`cap ${usage.limits.maxRoomsPerResort}/resort`} />
            <Stat label="Staff users" value={String(usage.staffUsers)} />
            <Stat label="Guests" value={String(usage.guests)} />
          </div>
          {role === "SUPER_ADMIN" && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-slate-500">Change plan:</span>
              {["FREE", "STANDARD", "PRO"].map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={usage.plan === p ? "primary" : "ghost"}
                  onClick={() => changePlan(p)}
                >
                  {p}
                </Button>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card title="Resort settings">
        <div className="space-y-3">
          <Field label="Resort name"><Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
          <Field label="Location"><Input value={d.location ?? ""} onChange={(e) => setD({ ...d, location: e.target.value })} /></Field>
          <Field label="Tax rate (%)"><Input type="number" min={0} max={100} value={String(d.taxRatePct)} onChange={(e) => setD({ ...d, taxRatePct: e.target.value })} /></Field>
          <label className="flex items-center gap-2 pt-1 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={d.showRatesToAgents}
              onChange={(e) => setD({ ...d, showRatesToAgents: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-brand-600"
            />
            Show room rates to agents
          </label>

          <div className="mt-2 border-t border-slate-100 pt-3 text-xs font-semibold text-slate-500">
            Invoice & stay settings
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Invoice prefix"><Input value={d.invoicePrefix} onChange={(e) => setD({ ...d, invoicePrefix: e.target.value })} /></Field>
            <Field label="Check-in time"><Input value={d.checkInTime} onChange={(e) => setD({ ...d, checkInTime: e.target.value })} placeholder="12:00 PM" /></Field>
            <Field label="Check-out time"><Input value={d.checkOutTime} onChange={(e) => setD({ ...d, checkOutTime: e.target.value })} placeholder="10:00 AM" /></Field>
          </div>
          <Field label="Address"><Input value={d.address ?? ""} onChange={(e) => setD({ ...d, address: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Website"><Input value={d.website ?? ""} onChange={(e) => setD({ ...d, website: e.target.value })} /></Field>
            <Field label="Contact phone"><Input value={d.contactPhone ?? ""} onChange={(e) => setD({ ...d, contactPhone: e.target.value })} /></Field>
          </div>

          <div className="pt-2"><Button onClick={save} loading={busy}>Save changes</Button></div>
        </div>
      </Card>

      {d._count && (
        <Card title="At a glance">
          <div className="flex gap-6 text-sm text-slate-600">
            <div><b className="text-slate-900">{d._count.bookings}</b> bookings</div>
            <div><b className="text-slate-900">{d._count.guests}</b> guests</div>
          </div>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2">
      <div className="text-[10px] font-medium text-slate-400">{label}</div>
      <div className="text-sm font-bold text-slate-800">{value}</div>
      {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
    </div>
  );
}
