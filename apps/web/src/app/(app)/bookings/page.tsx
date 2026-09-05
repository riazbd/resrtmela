"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  api, bdt, dmy, iso,
  type BookingDetail, type BookingRow, type RoomAvail,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  Badge, Button, Card, Empty, Field, Input, Modal, Select, Spinner, Td, Th, useToast,
} from "@/components/ui";

const STATES = ["PENDING", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT", "CANCELLED", "NO_SHOW"];
const SOURCES = ["DIRECT", "AGENT", "FACEBOOK", "WHATSAPP", "PHONE", "APP"];

const NEXT_ACTIONS: Record<string, { to: string; label: string }[]> = {
  PENDING: [
    { to: "CONFIRMED", label: "Confirm" },
  ],
  CONFIRMED: [
    { to: "CHECKED_IN", label: "Check in" },
    { to: "NO_SHOW", label: "Mark No-Show" },
  ],
  CHECKED_IN: [{ to: "CHECKED_OUT", label: "Check out" }],
  CHECKED_OUT: [],
  CANCELLED: [],
  NO_SHOW: [],
};

function NewBookingModal({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: (code: string) => void;
}) {
  const { activeResort, isStaff } = useAuth();
  const { push } = useToast();
  const [checkIn, setCheckIn] = useState(iso(new Date()));
  const [checkOut, setCheckOut] = useState(iso(new Date(Date.now() + 86400000)));
  const [grid, setGrid] = useState<RoomAvail[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [nid, setNid] = useState("");
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [remarks, setRemarks] = useState("");
  const [advAmount, setAdvAmount] = useState(0);
  const [advMethod, setAdvMethod] = useState("CASH");
  const [busy, setBusy] = useState(false);
  const [loadingGrid, setLoadingGrid] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadGrid = useCallback(async () => {
    if (!activeResort) return;
    setLoadingGrid(true);
    try {
      const g = await api<RoomAvail[]>(
        `/resorts/${activeResort.id}/availability?from=${checkIn}&to=${checkOut}`,
      );
      setGrid(g);
    } finally {
      setLoadingGrid(false);
    }
  }, [activeResort, checkIn, checkOut]);

  useEffect(() => {
    if (open) void loadGrid();
  }, [open, loadGrid]);

  const [walkIn, setWalkIn] = useState(false);
  const [isGroup, setIsGroup] = useState(false);
  const [createdGroup, setCreatedGroup] = useState<{ tag: string; count: number } | null>(null);

  async function submit() {
    if (!activeResort) return;
    setErr(null);
    setBusy(true);
    try {
      if (isGroup) {
        // tour group: one booking per room, one guest, shared terms
        const res = await api<{ groupTag: string; count: number; bookings: { code: string }[] }>(
          "/bookings/group",
          {
            method: "POST",
            body: {
              resortId: activeResort.id,
              roomIds: picked,
              checkIn,
              checkOut,
              adults,
              children,
              guest: {
                fullName: walkIn ? "local" : fullName,
                phone: walkIn ? undefined : phone,
                nidPassportNo: nid || undefined,
              },
              discountPerRoom: isStaff ? discount : undefined,
              advancePerRoom: advAmount > 0 ? advAmount : undefined,
              advanceMethod: advAmount > 0 ? advMethod : undefined,
              remarks: remarks || undefined,
            },
          },
        );
        push(`Group ${res.groupTag}: ${res.count} bookings (${res.bookings.map((b) => b.code).join(", ")})`);
        onCreated(res.groupTag);
        onClose();
        setPicked([]); setFullName(""); setPhone(""); setNid(""); setDiscount(0); setAdvAmount(0); setRemarks(""); setIsGroup(false); setWalkIn(false);
        return;
      }
      const created = await api<BookingDetail>("/bookings", {
        method: "POST",
        body: {
          resortId: activeResort.id,
          roomIds: picked,
          checkIn,
          checkOut,
          adults,
          children,
          guest: walkIn
            ? { fullName: fullName || "local" }
            : { fullName, phone, nidPassportNo: nid || undefined },
          discount: isStaff ? discount : undefined,
          remarks: remarks || undefined,
          advancePayment: advAmount > 0 ? { amount: advAmount, method: advMethod } : undefined,
        },
      });
      push(`Booking ${created.code} created`);
      onCreated(created.code);
      onClose();
      setPicked([]); setFullName(""); setPhone(""); setNid(""); setDiscount(0); setAdvAmount(0); setRemarks(""); setWalkIn(false);
    } catch (ex) {
      setErr((ex as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New booking" wide>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Check-in"><Input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} /></Field>
          <Field label="Check-out"><Input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} /></Field>
        </div>

        <div>
          <div className="mb-1 text-xs font-medium text-slate-600">
            Rooms {loadingGrid && <span className="text-slate-400">· checking availability…</span>}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {grid.map((r) => {
              const conflict = r.busyNights.length > 0;
              const checked = picked.includes(r.roomId);
              return (
                <button
                  key={r.roomId}
                  disabled={conflict}
                  onClick={() =>
                    setPicked((p) => (checked ? p.filter((x) => x !== r.roomId) : [...p, r.roomId]))
                  }
                  className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                    conflict
                      ? "cursor-not-allowed border-red-200 bg-red-50 text-red-400"
                      : checked
                        ? "border-brand-500 bg-brand-50 text-brand-900 ring-1 ring-brand-500"
                        : "border-slate-200 bg-white hover:border-brand-300"
                  }`}
                >
                  <div className="font-medium">{r.roomName}</div>
                  <div className="text-[11px]">
                    ৳{Number(r.baseRate).toLocaleString("en-IN")}
                    {conflict && ` · busy (${r.busyNights.length}n)`}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

          <div className="flex flex-wrap items-center gap-4 rounded-lg bg-slate-50 px-3 py-2">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <input type="checkbox" checked={walkIn} onChange={(e) => { setWalkIn(e.target.checked); if (e.target.checked) setFullName("local"); else setFullName(""); }} className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600" />
              Walk-in (local)
            </label>
            {picked.length > 1 && (
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                <input type="checkbox" checked={isGroup} onChange={(e) => setIsGroup(e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600" />
                Group: separate booking per room
              </label>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Guest name"><Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={walkIn ? "local" : "Full name"} disabled={walkIn} /></Field>
            {!walkIn && <Field label="Mobile"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXX-XXXXXX" /></Field>}
            {!walkIn && <Field label="NID / Passport"><Input value={nid} onChange={(e) => setNid(e.target.value)} placeholder="optional" /></Field>}
          <Field label="Adults"><Input type="number" min={1} value={adults} onChange={(e) => setAdults(Number(e.target.value))} /></Field>
          <Field label="Children"><Input type="number" min={0} value={children} onChange={(e) => setChildren(Number(e.target.value))} /></Field>
          {isStaff && (
            <Field label="Discount (৳)"><Input type="number" min={0} value={discount} onChange={(e) => setDiscount(Number(e.target.value))} /></Field>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Advance (৳)"><Input type="number" min={0} value={advAmount} onChange={(e) => setAdvAmount(Number(e.target.value))} /></Field>
          <Field label="Method">
            <Select value={advMethod} onChange={(e) => setAdvMethod(e.target.value)}>
              {["CASH", "BKASH", "NAGAD", "CARD", "BANK"].map((m) => <option key={m}>{m}</option>)}
            </Select>
          </Field>
          <Field label="Remarks"><Input value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field>
        </div>

        {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">{err}</div>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            loading={busy}
            disabled={!picked.length || !fullName || !phone}
            onClick={submit}
          >
            Create booking {picked.length ? `(${picked.length} room${picked.length > 1 ? "s" : ""})` : ""}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function AddPayment({ bookingId, onDone }: { bookingId: number; onDone: () => void }) {
  const { push } = useToast();
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState("CASH");
  const [busy, setBusy] = useState(false);

  async function pay() {
    setBusy(true);
    try {
      await api(`/bookings/${bookingId}/payments`, {
        method: "POST",
        body: { amount, method },
      });
      push("Payment recorded");
      onDone();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-end gap-2">
      <Field label="Record payment (৳)"><Input type="number" min={1} value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} className="!w-28" /></Field>
      <Select value={method} onChange={(e) => setMethod(e.target.value)} className="!w-24">
        {["CASH", "BKASH", "NAGAD", "CARD", "BANK"].map((m) => <option key={m}>{m}</option>)}
      </Select>
      <Button size="sm" onClick={pay} loading={busy} disabled={amount <= 0}>Add</Button>
    </div>
  );
}

function DetailDrawer({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const { isStaff, isAgent, isManagement } = useAuth();
  const { push } = useToast();
  const [b, setB] = useState<BookingDetail | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setB(await api<BookingDetail>(`/bookings/${id}`));
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function transition(to: string) {
    setBusy(true);
    try {
      await api(`/bookings/${id}/transition`, { method: "POST", body: { to } });
      push(`Booking ${to.replace(/_/g, " ").toLowerCase()}`);
      await load();
      onChanged();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function cancelStaff() {
    if (!window.confirm("Cancel this booking? Nights will be freed.")) return;
    setBusy(true);
    try {
      await api(`/bookings/${id}/transition`, { method: "POST", body: { to: "CANCELLED" } });
      push("Booking cancelled");
      await load();
      onChanged();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function requestCancel() {
    const reason = window.prompt("Reason for cancellation?") ?? "";
    setBusy(true);
    try {
      await api(`/bookings/${id}/cancel-request`, { method: "POST", body: { reason } });
      push("Cancel request sent for approval");
      await load();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function decide(approve: boolean) {
    setBusy(true);
    try {
      await api(`/bookings/${id}/cancel-decision`, { method: "POST", body: { approve } });
      push(approve ? "Cancellation approved" : "Cancellation rejected");
      await load();
      onChanged();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  if (!b) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-lg font-bold text-slate-900">{b.code}</div>
          <div className="text-xs text-slate-500">
            {dmy(b.checkIn)} → {dmy(b.checkOut)} · {b.nights} night(s) · {b.adults}A {b.children}C
          </div>
        </div>
        <div className="flex gap-1.5">
          <Badge value={b.state} />
          <Badge value={b.paymentState} />
          <Badge value={b.source} />
        </div>
      </div>

      {b.cancelState === "REQUESTED" && (
        <div className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
          Agent requested cancellation
          {isStaff && (
            <span className="flex gap-2">
              <Button size="sm" variant="danger" onClick={() => decide(true)} loading={busy}>Approve</Button>
              <Button size="sm" variant="ghost" onClick={() => decide(false)} loading={busy}>Reject</Button>
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-slate-50 p-3">
          <div className="text-[11px] font-medium text-slate-400">GUEST</div>
          <div className="font-medium text-slate-800">{b.guest.fullName}</div>
          <div className="text-xs text-slate-500">{b.guest.phone}</div>
          {b.guest.nidPassportNo && <div className="text-xs text-slate-400">ID: {b.guest.nidPassportNo}</div>}
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <div className="text-[11px] font-medium text-slate-400">MONEY</div>
          <div className="grid grid-cols-2 gap-x-3 text-xs">
            <span className="text-slate-500">Rent</span><span className="font-medium">{bdt(b.rent)}</span>
            <span className="text-slate-500">Discount</span><span>{bdt(b.discount)}</span>
            <span className="text-slate-500">Paid</span><span className="text-green-700">{bdt(b.paid)}</span>
            <span className="text-slate-500">Due</span><span className="font-bold text-red-700">{bdt(b.due)}</span>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-1 text-xs font-medium text-slate-500">Rooms</div>
        <div className="flex flex-wrap gap-1.5">
          {b.items.map((i) => (
            <span key={i.id} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">
              {i.room?.name ?? i.kind} · {bdt(i.unitPrice)}/night
            </span>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 text-xs font-medium text-slate-500">Payment ledger</div>
        {b.payments.length === 0 ? (
          <div className="text-xs text-slate-400">No payments yet</div>
        ) : (
          <table className="w-full">
            <tbody className="divide-y divide-slate-100">
              {b.payments.map((p) => (
                <tr key={p.id}>
                  <Td className="!py-1.5 text-xs">{dmy(p.receivedAt)}</Td>
                  <Td className="!py-1.5 text-xs">{p.type}</Td>
                  <Td className="!py-1.5 text-xs">{p.method}</Td>
                  <Td className="!py-1.5 text-xs text-slate-400">{p.receivedBy}</Td>
                  <Td className="!py-1.5 text-right text-xs font-medium">{bdt(p.amount)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {isStaff && b.state !== "CANCELLED" && (
          <div className="mt-2"><AddPayment bookingId={b.id} onDone={async () => { await load(); onChanged(); }} /></div>
        )}
      </div>

      {b.remarks && (
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs italic text-slate-500">{b.remarks}</div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
        {isStaff &&
          (NEXT_ACTIONS[b.state] ?? []).map((a) => (
            <Button key={a.to} size="sm" onClick={() => transition(a.to)} loading={busy}>
              {a.label}
            </Button>
          ))}
        {isStaff && !b.invoiceNo && !["CANCELLED", "NO_SHOW"].includes(b.state) && (
          <Button
            size="sm"
            variant="ghost"
            loading={busy}
            onClick={async () => {
              try {
                await api(`/bookings/${b.id}/invoice`, { method: "POST" });
                push("Invoice generated");
                await load();
              } catch (ex) {
                push((ex as Error).message, "err");
              }
            }}
          >
            Generate invoice
          </Button>
        )}        {isStaff && b.invoiceNo && (
          <a
            href={`/invoice/${b.id}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Invoice {b.invoiceNo}
          </a>
        )}
        {isStaff && ["PENDING", "CONFIRMED", "CHECKED_IN"].includes(b.state) && (
          <Button size="sm" variant="danger" onClick={cancelStaff} loading={busy}>Cancel booking</Button>
        )}
        {isAgent && ["PENDING", "CONFIRMED"].includes(b.state) && b.cancelState === "NONE" && (
          <Button size="sm" variant="ghost" onClick={requestCancel} loading={busy}>Request cancellation</Button>
        )}
        {!isStaff && !isAgent && isManagement && null}
      </div>
    </div>
  );
}

function BookingsInner() {
  const { activeResort } = useAuth();
  const params = useSearchParams();
  const focusId = params.get("id");
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState("");
  const [source, setSource] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!activeResort) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ resortId: String(activeResort.id), take: "100" });
      if (state) qs.set("state", state);
      if (source) qs.set("source", source);
      if (group) qs.set("group", group);
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      const res = await api<{ rows: BookingRow[]; total: number }>(`/bookings?${qs}`);
      setRows(res.rows);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, [activeResort, state, source, from, to, group]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (focusId) setOpenId(Number(focusId));
  }, [focusId]);

  const filtered = useMemo(
    () =>
      q
        ? rows.filter(
            (r) =>
              r.guest?.fullName?.toLowerCase().includes(q.toLowerCase()) ||
              r.guest?.phone?.includes(q) ||
              r.code.toLowerCase().includes(q.toLowerCase()),
          )
        : rows,
    [rows, q],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Group tag"><Input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="GRP-0001" className="!w-28" /></Field>
        <Field label="Search guest / code / phone"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type to filter…" className="!w-56" /></Field>
        <Field label="Status">
          <Select value={state} onChange={(e) => setState(e.target.value)} className="!w-36">
            <option value="">All</option>
            {STATES.map((s) => <option key={s}>{s.replace(/_/g, "-")}</option>)}
          </Select>
        </Field>
        <Field label="Source">
          <Select value={source} onChange={(e) => setSource(e.target.value)} className="!w-32">
            <option value="">All</option>
            {SOURCES.map((s) => <option key={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="!w-36" /></Field>
        <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="!w-36" /></Field>
        <div className="ml-auto">
          <Button onClick={() => setShowNew(true)}>+ New booking</Button>
        </div>
      </div>

      <Card className="!p-0">
        {loading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <Empty msg="No bookings match" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead className="border-b border-slate-100">
                <tr>
                  <Th>Code</Th><Th>Guest</Th><Th>Stay</Th><Th>Rooms</Th>
                  <Th>Source</Th><Th>Status</Th><Th>Payment</Th><Th className="text-right">Due</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((b) => (
                  <tr
                    key={b.id}
                    onClick={() => setOpenId(b.id)}
                    className="cursor-pointer hover:bg-brand-50/40"
                  >
                    <Td className="font-medium text-brand-700">{b.code}{b.groupTag ? <div className="text-[10px] font-normal text-slate-400">{b.groupTag}</div> : null}</Td>
                    <Td>
                      <div>{b.guest?.fullName}</div>
                      <div className="text-[11px] text-slate-400">{b.guest?.phone}</div>
                    </Td>
                    <Td className="text-xs">{dmy(b.checkIn)} → {dmy(b.checkOut)}<div className="text-[11px] text-slate-400">{b.nights}n</div></Td>
                    <Td className="text-xs">{b.rooms.join(", ")}</Td>
                    <Td className="text-xs">{b.source}{b.agent ? <div className="text-[11px] text-slate-400">{b.agent}</div> : null}</Td>
                    <Td><Badge value={b.state} /></Td>
                    <Td><Badge value={b.paymentState} /></Td>
                    <Td className="text-right font-semibold">{bdt(b.due)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <div className="text-xs text-slate-400">{filtered.length} of {total} bookings</div>

      <NewBookingModal open={showNew} onClose={() => setShowNew(false)} onCreated={() => void load()} />

      <Modal open={openId !== null} onClose={() => setOpenId(null)} title="Booking" wide>
        {openId !== null && (
          <DetailDrawer id={openId} onClose={() => setOpenId(null)} onChanged={() => void load()} />
        )}
      </Modal>
    </div>
  );
}

export default function BookingsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <BookingsInner />
    </Suspense>
  );
}
