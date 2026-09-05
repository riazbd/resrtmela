"use client";

import { useCallback, useEffect, useState } from "react";
import { api, bdt } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { Badge, Button, Card, Empty, Field, Input, Modal, Select, Spinner, Td, Th, useToast } from "@/components/ui";

interface BillItem {
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
}
interface Bill {
  id: number;
  code: string;
  billDate: string;
  guestName: string | null;
  bookingId: number | null;
  method: string | null;
  items: BillItem[];
  total: number;
  paid: number;
  due: number;
  status: string;
}
interface InHouse {
  bookingId: number;
  code: string;
  guestName: string;
  rooms: (string | null)[];
}

const MEAL_PRESETS = [
  { name: "Lunch", price: 300 },
  { name: "Dinner", price: 350 },
  { name: "Breakfast", price: 200 },
];

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function FbPage() {
  const { activeResort, isStaff, isManagement } = useAuth();
  const t = useT();
  const { push } = useToast();
  const [bills, setBills] = useState<Bill[] | null>(null);
  const [inHouse, setInHouse] = useState<InHouse[] | null>(null);
  const [target, setTarget] = useState<{ bookingId: number | null; label: string } | null>(null);
  const [ticket, setTicket] = useState<BillItem[]>([{ name: "Lunch", qty: 1, unitPrice: 300, total: 300 }]);
  const [paidAmount, setPaidAmount] = useState(0);
  const [method, setMethod] = useState("CASH");
  const [date, setDate] = useState(iso(new Date()));
  const [from, setFrom] = useState(iso(new Date(Date.now() - 7 * 86400000)));
  const [to, setTo] = useState(iso(new Date(Date.now() + 86400000)));
  const [payFor, setPayFor] = useState<Bill | null>(null);
  const [payAmt, setPayAmt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const canManage = isManagement;

  const load = useCallback(async () => {
    if (!activeResort) return;
    setLoading(true);
    try {
      const [b, ih] = await Promise.all([
        api<Bill[]>(`/resorts/${activeResort.id}/fb/bills?from=${from}&to=${to}`),
        api<InHouse[]>(`/resorts/${activeResort.id}/fb/in-house`),
      ]);
      setBills(b);
      setInHouse(ih);
    } finally {
      setLoading(false);
    }
  }, [activeResort, from, to]);

  useEffect(() => {
    if (isStaff) void load();
  }, [load, isStaff]);

  const total = ticket.reduce((s, i) => s + i.qty * i.unitPrice, 0);

  function setItem(i: number, patch: Partial<BillItem>) {
    setTicket((tk) => tk.map((x, xi) => {
      if (xi !== i) return x;
      const next = { ...x, ...patch };
      next.total = next.qty * next.unitPrice;
      return next;
    }));
  }

  async function createTicket() {
    if (!activeResort || !target) return;
    setBusy(true);
    try {
      const created = await api<Bill>(`/resorts/${activeResort.id}/fb/bills`, {
        method: "POST",
        body: {
          date,
          items: ticket.filter((i) => i.name && i.qty > 0).map(({ name, qty, unitPrice }) => ({ name, qty, unitPrice })),
          bookingId: target.bookingId ?? undefined,
          guestName: target.bookingId ? undefined : target.label,
          paidAmount,
          method: paidAmount > 0 ? method : undefined,
        },
      });
      push(`${created.code} — ${bdt(created.total)}${target.bookingId ? " charged to room" : ""}`);
      setTarget(null);
      setTicket([{ name: "Lunch", qty: 1, unitPrice: 300, total: 300 }]);
      setPaidAmount(0);
      await load();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function collect() {
    if (!payFor) return;
    setBusy(true);
    try {
      await api(`/fb/bills/${payFor.id}/pay`, { method: "POST", body: { amount: payAmt, method: "CASH" } });
      push(`${bdt(payAmt)} collected on ${payFor.code}`);
      setPayFor(null);
      await load();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  if (!isStaff) return <Empty msg="Staff only" />;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-5">
        {/* room tabs */}
        <Card title="In-house / walk-in" className="lg:col-span-2">
          {inHouse === null ? (
            <Spinner />
          ) : (
            <div className="space-y-1.5">
              <button
                onClick={() => setTarget({ bookingId: null, label: "" })}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                  target?.bookingId === null ? "border-brand-500 bg-brand-50" : "border-dashed border-slate-300 hover:border-brand-300"
                }`}
              >
                <div className="font-medium">Walk-in guest</div>
                <div className="text-[11px] text-slate-400">cash counter, no room charge</div>
              </button>
              {inHouse.length === 0 && <Empty msg="No in-house guests right now" />}
              {inHouse.map((h) => (
                <button
                  key={h.bookingId}
                  onClick={() => setTarget({ bookingId: h.bookingId, label: `${h.guestName} · ${h.rooms.join(", ")}` })}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                    target?.bookingId === h.bookingId ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:border-brand-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{h.guestName}</span>
                    <span className="text-[11px] text-slate-400">{h.rooms.join(", ")}</span>
                  </div>
                  <div className="text-[11px] text-slate-400">{h.code}</div>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* ticket */}
        <Card
          title={target ? `Ticket — ${target.label}` : "Ticket — pick a room or walk-in"}
          className="lg:col-span-3"
          action={
            target && (
              <Button size="sm" variant="ghost" onClick={() => setTicket([...ticket, { name: "", qty: 1, unitPrice: 0, total: 0 }])}>
                + Line
              </Button>
            )
          }
        >
          {!target ? (
            <Empty msg="Select who the bill is for" />
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-medium text-slate-400">PRESETS</span>
                {MEAL_PRESETS.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => setTicket([...ticket, { name: p.name, qty: 1, unitPrice: p.price, total: p.price }])}
                    className="rounded-full border border-slate-300 px-2.5 py-1 text-xs hover:border-brand-400 hover:bg-brand-50"
                  >
                    {p.name} · {bdt(p.price)}
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                {ticket.map((it, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <Field label={i === 0 ? "Item" : ""}><Input value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} /></Field>
                    <Field label={i === 0 ? "Qty" : ""}><Input type="number" min={1} value={it.qty} onChange={(e) => setItem(i, { qty: Number(e.target.value) })} className="!w-16" /></Field>
                    <Field label={i === 0 ? "Unit ৳" : ""}><Input type="number" min={0} value={it.unitPrice || ""} onChange={(e) => setItem(i, { unitPrice: Number(e.target.value) })} className="!w-24" /></Field>
                    <div className="w-20 pb-2 text-right text-sm font-medium">{bdt(it.qty * it.unitPrice)}</div>
                    {ticket.length > 1 && (
                      <Button size="sm" variant="ghost" onClick={() => setTicket(ticket.filter((_, x) => x !== i))}>✕</Button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-end justify-between gap-3 border-t border-slate-100 pt-3">
                <div className="flex items-end gap-2">
                  <Field label="Paid now (৳)"><Input type="number" min={0} value={paidAmount || ""} onChange={(e) => setPaidAmount(Number(e.target.value))} className="!w-28" /></Field>
                  <Field label="Method">
                    <Select value={method} onChange={(e) => setMethod(e.target.value)} className="!w-28">
                      {["CASH", "BKASH", "NAGAD", "CARD"].map((m) => <option key={m}>{m}</option>)}
                    </Select>
                  </Field>
                  <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="!w-36" /></Field>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-400">Total</div>
                  <div className="text-xl font-bold text-slate-900">{bdt(total)}</div>
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={createTicket} loading={busy} disabled={total <= 0}>
                  {target.bookingId
                    ? `Charge to room (${bdt(Math.max(0, total - paidAmount))} due)`
                    : `Create bill (${bdt(total)})`}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* recent bills */}
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-end gap-3">
          <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
      </div>

      {loading || !bills ? (
        <Spinner />
      ) : (
        <Card title={`Bills (${bills.length})`} className="!p-0">
          {bills.length === 0 ? (
            <Empty msg="No bills in this period" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead className="border-b border-slate-100">
                  <tr><Th>Bill</Th><Th>Date</Th><Th>Items</Th><Th>Guest / Room</Th><Th>Status</Th><Th className="text-right">Total</Th><Th className="text-right">Due</Th>{canManage && <Th />}</tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {bills.map((b) => (
                    <tr key={b.id}>
                      <Td className="font-medium text-brand-700">{b.code}</Td>
                      <Td className="text-xs">{b.billDate.slice(0, 10)}</Td>
                      <Td className="text-xs">{b.items.map((i) => `${i.name}×${i.qty}`).join(", ")}</Td>
                      <Td className="text-xs">{b.guestName ?? (b.bookingId ? `room charge #${b.bookingId}` : "walk-in")}</Td>
                      <Td><Badge value={b.status} /></Td>
                      <Td className="text-right">{bdt(b.total)}</Td>
                      <Td className={`text-right font-semibold ${b.due > 0 ? "text-red-700" : ""}`}>{bdt(b.due)}</Td>
                      {canManage && (
                        <Td className="text-right">
                          {b.due > 0 && (
                            <Button size="sm" variant="ghost" onClick={() => { setPayFor(b); setPayAmt(b.due); }}>Collect</Button>
                          )}
                        </Td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* collect modal */}
      <Modal open={!!payFor} onClose={() => setPayFor(null)} title={`Collect — ${payFor?.code ?? ""}`}>
        {payFor && (
          <div className="space-y-3">
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              due <b className="text-red-700">{bdt(payFor.due)}</b>
              {payFor.bookingId ? " · charged to room" : ""}
            </div>
            <Field label="Amount (৳)"><Input type="number" min={1} value={payAmt || ""} onChange={(e) => setPayAmt(Number(e.target.value))} /></Field>
            <div className="flex justify-end">
              <Button onClick={collect} loading={busy} disabled={payAmt <= 0}>Record</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
