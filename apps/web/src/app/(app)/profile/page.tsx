"use client";

import { useCallback, useEffect, useState } from "react";
import { api, bdt, dmy, type BookingRow } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Badge, Button, Card, Empty, Field, Input, Spinner, Stat, Td, Th, useToast } from "@/components/ui";

interface StaffRow {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  status: string;
}

/** Agent portal home — doc §3 "Agent Portal": profile, commission, my stats, agency staff. */
export default function ProfilePage() {
  const { me, activeResort, isAgent } = useAuth();
  const { push } = useToast();
  const [rows, setRows] = useState<BookingRow[] | null>(null);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [form, setForm] = useState({ name: "", phone: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!activeResort || !isAgent) return;
    api<{ rows: BookingRow[] }>(`/bookings?resortId=${activeResort.id}&take=200`)
      .then((r) => setRows(r.rows))
      .catch(() => setRows([]));
  }, [activeResort, isAgent]);

  const loadStaff = useCallback(() => {
    api<StaffRow[]>("/agent/staff").then(setStaff).catch(() => setStaff([]));
  }, []);
  useEffect(() => {
    if (isAgent) loadStaff();
  }, [isAgent, loadStaff]);

  async function addStaff() {
    setBusy(true);
    try {
      await api("/agent/staff", {
        method: "POST",
        body: { name: form.name, phone: form.phone || undefined, email: form.email || undefined, password: form.password },
      });
      push("Agency user created — they can log in and book for guests");
      setForm({ name: "", phone: "", email: "", password: "" });
      loadStaff();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  if (!isAgent) return <Empty msg="Agent portal only" />;

  const commissionEntry = me?.resorts.find((r) => r.resort.id === activeResort?.id);
  const rate = commissionEntry?.commissionRate ?? 0;

  const stats = (rows ?? []).reduce(
    (acc, b) => {
      acc.count++;
      acc.rent += b.rent;
      acc.due += b.due;
      if (b.state === "CONFIRMED" || b.state === "CHECKED_IN") acc.active++;
      return acc;
    },
    { count: 0, rent: 0, due: 0, active: 0 },
  );
  const commission = (stats.rent * rate) / 100;

  return (
    <div className="space-y-4">
      <Card title="Agent profile">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-lg font-bold text-white">
            {me?.name.slice(0, 1)}
          </div>
          <div>
            <div className="text-base font-semibold">{me?.name}</div>
            <div className="text-xs text-slate-500">{me?.phone} · Agent · {activeResort?.name}</div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-[11px] font-medium text-slate-400">Commission rate</div>
            <div className="text-xl font-bold text-brand-700">{rate}%</div>
          </div>
        </div>
      </Card>

      {rows === null ? (
        <Spinner />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="My bookings" value={String(stats.count)} />
            <Stat label="Active" value={String(stats.active)} tone="green" />
            <Stat label="Sold rent" value={bdt(stats.rent)} />
            <Stat label="Est. commission" value={bdt(commission)} tone="green" sub={`${rate}% of rent`} />
          </div>

          <Card title="My recent bookings" className="!p-0">
            {rows.length === 0 ? (
              <Empty msg="No bookings yet — create one from the Bookings tab" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead className="border-b border-slate-100">
                    <tr><Th>Code</Th><Th>Guest</Th><Th>Stay</Th><Th>Status</Th><Th className="text-right">Due</Th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {rows.slice(0, 15).map((b) => (
                      <tr key={b.id}>
                        <Td className="font-medium text-brand-700">{b.code}</Td>
                        <Td>{b.guest?.fullName}</Td>
                        <Td className="text-xs">{dmy(b.checkIn)} → {dmy(b.checkOut)}</Td>
                        <Td className="space-x-1"><Badge value={b.state} /><Badge value={b.paymentState} /></Td>
                        <Td className="text-right font-semibold">{bdt(b.due)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title={`Agency users (${staff.length})`}>
              <p className="mb-3 text-xs text-slate-500">Your own team — they log in with the same agent powers (book for guests, see resorts).</p>
              {staff.length === 0 ? (
                <Empty msg="No agency users yet" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr><Th>Name</Th><Th>Login</Th><Th>Status</Th></tr>
                    </thead>
                    <tbody>
                      {staff.map((s) => (
                        <tr key={s.id} className="border-t border-slate-100">
                          <Td className="font-semibold text-slate-800">{s.name}</Td>
                          <Td className="text-xs">{s.phone ?? s.email ?? "—"}</Td>
                          <Td>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${s.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{s.status}</span>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
            <Card title="Add agency user">
              <div className="space-y-3">
                <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
                <Field label="Phone (login)"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="8801XXXXXXXXX" /></Field>
                <Field label="Email (alternative login)"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="optional" /></Field>
                <Field label="Password"><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
                <Button onClick={addStaff} loading={busy} disabled={!form.name || !form.password || (!form.phone && !form.email)}>Create user</Button>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
