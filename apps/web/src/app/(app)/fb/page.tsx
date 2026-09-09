"use client";

import { useCallback, useEffect, useState } from "react";
import { api, client, money, type FoodPackage, cur } from "@/lib/api";
import { useApi, keys, useQueryClient } from "@/lib/query";
import { ErrorState, Skeleton } from "@/components/error-state";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { Badge, Button, Card, Empty, Field, Input, Modal, Select, Spinner, Td, Th, useToast } from "@/components/ui";
import { Package as PackageIcon, Trash2 } from "lucide-react";

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
  const [pkgForm, setPkgForm] = useState({ name: "", price: "", items: "" });
  const qc = useQueryClient();

  const canManage = isManagement;
  const enabled = isStaff && !!activeResort;

  const billsQ = useApi(
    keys.fbBills(activeResort?.id, `${from}:${to}`),
    () => api<{ rows: Bill[]; total: number; truncated: boolean }>(`/resorts/${activeResort!.id}/fb/bills?from=${from}&to=${to}`),
    { enabled, placeholderData: (prev) => prev },
  );
  // the in-house list is what the kitchen charges a room against, so it is
  // read on every ticket — and it changes only at check-in and check-out
  const inHouseQ = useApi(keys.fbInHouse(activeResort?.id), () => api<InHouse[]>(`/resorts/${activeResort!.id}/fb/in-house`), { enabled });
  const packagesQ = useApi(keys.fbPackages(activeResort?.id), () => client.fb.packages(activeResort!.id), { enabled, staleTime: 3_600_000 });

  const bills: Bill[] = billsQ.data?.rows ?? [];
  const billsTotal = billsQ.data?.total ?? 0;
  const inHouse: InHouse[] = inHouseQ.data ?? [];
  const packages: FoodPackage[] = packagesQ.data ?? [];
  const loading = billsQ.isPending;
  const loadError = billsQ.error ?? inHouseQ.error ?? packagesQ.error;

  const load = useCallback(async () => {
    const rid = activeResort?.id;
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["fb-bills", rid] }),
      qc.invalidateQueries({ queryKey: ["fb-in-house", rid] }),
      qc.invalidateQueries({ queryKey: ["fb-packages", rid] }),
      // a bill charged to a stay changes that booking's due
      qc.invalidateQueries({ queryKey: ["dues", rid] }),
      qc.invalidateQueries({ queryKey: ["bookings", rid] }),
    ]);
  }, [qc, activeResort]);

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
      push(`${created.code} — ${money(created.total)}${target.bookingId ? " charged to room" : ""}`);
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
      push(`${money(payAmt)} collected on ${payFor.code}`);
      setPayFor(null);
      await load();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function createPackage() {
    if (!activeResort) return;
    setBusy(true);
    try {
      await api(`/resorts/${activeResort.id}/fb/packages`, {
        method: "POST",
        body: { name: pkgForm.name, price: Number(pkgForm.price), items: pkgForm.items || undefined },
      });
      push("Food package created");
      setPkgForm({ name: "", price: "", items: "" });
      await load();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function removePackage(id: number) {
    if (!window.confirm("Delete this package?")) return;
    try {
      await api(`/fb/packages/${id}`, { method: "DELETE" });
      await load();
    } catch (ex) {
      push((ex as Error).message, "err");
    }
  }

  if (!isStaff) return <Empty msg="Staff only" />;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-5">
        {/* room tabs */}
        <Card title="In-house / walk-in" className="lg:col-span-2">
          {inHouseQ.isPending ? (
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
                    {p.name} · {money(p.price)}
                  </button>
                ))}
                {packages.filter((p) => p.active).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setTicket([...ticket, { name: p.name, qty: 1, unitPrice: p.price, total: p.price }])}
                    title={p.items ?? undefined}
                    className="rounded-full border border-brand-300 bg-brand-50/60 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100"
                  >
                    <PackageIcon className="mr-1 inline h-3 w-3" />{p.name} · {money(p.price)}
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                {ticket.map((it, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <Field label={i === 0 ? "Item" : ""}><Input value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} /></Field>
                    <Field label={i === 0 ? "Qty" : ""}><Input type="number" min={1} value={it.qty} onChange={(e) => setItem(i, { qty: Number(e.target.value) })} className="!w-16" /></Field>
                    <Field label={i === 0 ? "Unit ৳" : ""}><Input type="number" min={0} value={it.unitPrice || ""} onChange={(e) => setItem(i, { unitPrice: Number(e.target.value) })} className="!w-24" /></Field>
                    <div className="w-20 pb-2 text-right text-sm font-medium">{money(it.qty * it.unitPrice)}</div>
                    {ticket.length > 1 && (
                      <Button size="sm" variant="ghost" onClick={() => setTicket(ticket.filter((_, x) => x !== i))}>✕</Button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-end justify-between gap-3 border-t border-slate-100 pt-3">
                <div className="flex items-end gap-2">
                  <Field label={`Paid now (${cur()})`}><Input type="number" min={0} value={paidAmount || ""} onChange={(e) => setPaidAmount(Number(e.target.value))} className="!w-28" /></Field>
                  <Field label="Method">
                    <Select value={method} onChange={(e) => setMethod(e.target.value)} className="!w-28">
                      {["CASH", "BKASH", "NAGAD", "CARD"].map((m) => <option key={m}>{m}</option>)}
                    </Select>
                  </Field>
                  <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="!w-36" /></Field>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-400">Total</div>
                  <div className="text-xl font-bold text-slate-900">{money(total)}</div>
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={createTicket} loading={busy} disabled={total <= 0}>
                  {target.bookingId
                    ? `Charge to room (${money(Math.max(0, total - paidAmount))} due)`
                    : `Create bill (${money(total)})`}
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

      {canManage && (
        <Card title="Food packages (items & combos)">
          <div className="flex flex-wrap items-center gap-2">
            {packages.length === 0 && <span className="text-xs text-slate-400">No packages yet</span>}
            {packages.map((p) => (
              <div key={p.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm">
                <span className={`font-semibold ${p.active ? "text-slate-700" : "text-slate-300"}`}>{p.name}</span>
                <span className="text-xs text-slate-500">{money(p.price)}</span>
                {p.items && <span className="max-w-[220px] truncate text-[10px] text-slate-400">{p.items}</span>}
                <button onClick={() => removePackage(p.id)} title="Delete" className="text-slate-300 hover:text-red-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <Field label="Package name"><Input className="!w-44" value={pkgForm.name} onChange={(e) => setPkgForm({ ...pkgForm, name: e.target.value })} placeholder="BBQ Dinner for 2" /></Field>
            <Field label={`Price (${cur()})`}><Input className="!w-28" type="number" min={0} value={pkgForm.price} onChange={(e) => setPkgForm({ ...pkgForm, price: e.target.value })} /></Field>
            <Field label="Included items"><Input className="!w-64" value={pkgForm.items} onChange={(e) => setPkgForm({ ...pkgForm, items: e.target.value })} placeholder="rice, chicken, salad, borhani" /></Field>
            <Button size="sm" onClick={createPackage} loading={busy} disabled={!pkgForm.name || !pkgForm.price}>Add package</Button>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Packages appear as one-click buttons on every ticket.</p>
        </Card>
      )}

      {loadError ? (
        <ErrorState error={loadError} />
      ) : loading ? (
        <Skeleton rows={4} />
      ) : (
        <Card title={`Bills (${billsTotal > bills.length ? `${bills.length} of ${billsTotal}` : bills.length})`} className="!p-0">
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
                      <Td className="text-right">{money(b.total)}</Td>
                      <Td className={`text-right font-semibold ${b.due > 0 ? "text-red-700" : ""}`}>{money(b.due)}</Td>
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
              due <b className="text-red-700">{money(payFor.due)}</b>
              {payFor.bookingId ? " · charged to room" : ""}
            </div>
            <Field label={`Amount (${cur()})`}><Input type="number" min={1} value={payAmt || ""} onChange={(e) => setPayAmt(Number(e.target.value))} /></Field>
            <div className="flex justify-end">
              <Button onClick={collect} loading={busy} disabled={payAmt <= 0}>Record</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
