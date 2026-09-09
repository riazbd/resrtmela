"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { bookingHandoff } from "@/lib/booking-handoff";
import { FileDown } from "lucide-react";
import {
  api, client, money, dmy, iso,
  type BookingDetail, type BookingRow, type RoomAvail, cur,
} from "@/lib/api";
import { useApi, keys, useQueryClient } from "@/lib/query";
import { useOutbox } from "@/lib/outbox";
import { ErrorState, Skeleton } from "@/components/error-state";
import { useAuth } from "@/lib/auth";
import {
  Badge, Button, Card, Empty, Field, Input, Modal, Select, Spinner, Td, Th, useToast,
} from "@/components/ui";
import { usePaymentMethods } from "@/lib/resort-options";

/** Just enough of a room type to decide whether extra persons are allowed. */
interface RoomTypeLite {
  id: number;
  name: string;
  extraPersonAllowed?: boolean;
  extraPersonRate?: string | number;
}

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

function NewBookingModal({ open, onClose, onCreated, preset }: {
  open: boolean; onClose: () => void; onCreated: (code: string) => void;
  preset?: { roomId?: number | null; checkIn?: string | null; checkOut?: string | null } | null;
}) {
  const methodChoices = usePaymentMethods(useAuth().activeResort?.id);
  const { activeResort, isStaff, role, isAgent } = useAuth();
  const { push } = useToast();
  const [checkIn, setCheckIn] = useState(iso(new Date()));
  const [checkOut, setCheckOut] = useState(iso(new Date(Date.now() + 86400000)));
  const [picked, setPicked] = useState<number[]>([]);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [nid, setNid] = useState("");
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [extraPersons, setExtraPersons] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [remarks, setRemarks] = useState("");
  const [advAmount, setAdvAmount] = useState(0);
  const [advMethod, setAdvMethod] = useState("CASH");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !preset) return;
    if (preset.checkIn) setCheckIn(preset.checkIn);
    if (preset.checkOut) setCheckOut(preset.checkOut);
    else if (preset.checkIn) setCheckOut(iso(new Date(new Date(preset.checkIn).getTime() + 86400000)));
    if (preset.roomId) setPicked([preset.roomId]);
    else setPicked([]);
  }, [open, preset]);

  // availability is asked for on every date change while the clerk is picking
  // a room, so the same fortnight is not fetched twice
  const gridQ = useApi(
    keys.availability(activeResort?.id, checkIn, checkOut),
    () => client.rooms.availability(activeResort!.id, checkIn, checkOut),
    { enabled: open && !!activeResort && !!checkIn && !!checkOut, placeholderData: (prev) => prev },
  );
  const grid: RoomAvail[] = gridQ.data ?? [];
  const loadingGrid = gridQ.isFetching;

  // room types for the extra-person gate — a property of the resort, cached
  const typesQ = useApi(
    keys.resort(activeResort?.id),
    () => api<{ roomTypes?: RoomTypeLite[] }>(`/resorts/${activeResort!.id}`),
    { enabled: open && !!activeResort, staleTime: 3_600_000 },
  );
  const roomTypes: RoomTypeLite[] = typesQ.data?.roomTypes ?? [];

  const pickedTypes = grid
    .filter((r) => picked.includes(r.roomId))
    .map((r) => roomTypes.find((t) => t.id === r.roomTypeId))
    .filter(Boolean);
  const extraAllowed = pickedTypes.some((t) => t?.extraPersonAllowed);
  const extraRate = Math.max(0, ...pickedTypes.map((t) => Number(t?.extraPersonRate ?? 0)));


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
          walkIn,
          extraPersons: extraPersons > 0 ? extraPersons : undefined,
          guest: walkIn
            ? { fullName: fullName || "local", phone: phone || undefined, email: email || undefined }
            : { fullName, phone, email: email || undefined, nidPassportNo: nid || undefined },
          discount: isStaff ? discount : undefined,
          remarks: remarks || undefined,
          advancePayment: advAmount > 0 ? { amount: advAmount, method: advMethod } : undefined,
        },
      });
      push(`Booking ${created.code} created`);
      onCreated(created.code);
      onClose();
      setPicked([]); setFullName(""); setPhone(""); setEmail(""); setNid(""); setDiscount(0); setAdvAmount(0); setRemarks(""); setWalkIn(false); setExtraPersons(0);
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
                  {/* The agent's own rate comes from the server, which knows
                      whether their terms are a percentage or a flat fee. This
                      used to be worked out here as `rate × (1 − pct/100)`,
                      which quietly showed a flat-fee agent the wrong price. */}
                  <div className="text-[11px]">
                    {r.agentRate != null ? (
                      <>
                        <span className="text-slate-400 line-through">{money(Number(r.baseRate))}</span>
                        {" "}<span className="font-bold text-brand-700">{money(r.agentRate)}</span>
                        <span className="text-slate-400"> your price</span>
                      </>
                    ) : (
                      <>{money(Number(r.baseRate))}</>
                    )}
                    {conflict && ` · busy (${r.busyNights.length}n)`}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

          <div className="flex flex-wrap items-center gap-4 rounded-lg bg-slate-50 px-3 py-2">
            {!isAgent && (
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                <input type="checkbox" checked={walkIn} onChange={(e) => { setWalkIn(e.target.checked); if (e.target.checked && !fullName) setFullName("local"); if (!e.target.checked && fullName === "local") setFullName(""); }} className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600" />
                Walk-in (local)
              </label>
            )}
            {picked.length > 1 && (
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                <input type="checkbox" checked={isGroup} onChange={(e) => setIsGroup(e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600" />
                Group: separate booking per room
              </label>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Guest name"><Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={walkIn ? "local" : "Full name"} /></Field>
            <Field label="Mobile"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={walkIn ? "optional" : "01XXX-XXXXXX"} /></Field>
            <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="optional — invoices & OTP" /></Field>
            {!walkIn && <Field label="NID / Passport"><Input value={nid} onChange={(e) => setNid(e.target.value)} placeholder="optional" /></Field>}
          <Field label="Adults"><Input type="number" min={1} value={adults} onChange={(e) => setAdults(Number(e.target.value))} /></Field>
          <Field label="Children"><Input type="number" min={0} value={children} onChange={(e) => setChildren(Number(e.target.value))} /></Field>
          {extraAllowed && (
            <Field label="Extra persons" hint={`+${money(extraRate)} / person / night`}>
              <Input type="number" min={0} value={extraPersons} onChange={(e) => setExtraPersons(Math.max(0, Number(e.target.value)))} />
            </Field>
          )}
          {isStaff && (
            <Field label={`Discount (${cur()})`}><Input type="number" min={0} value={discount} onChange={(e) => setDiscount(Number(e.target.value))} /></Field>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label={`Advance (${cur()})`}><Input type="number" min={0} value={advAmount} onChange={(e) => setAdvAmount(Number(e.target.value))} /></Field>
          <Field label="Method">
            <Select value={advMethod} onChange={(e) => setAdvMethod(e.target.value)}>
              {methodChoices.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}
            </Select>
          </Field>
          <Field label="Remarks"><Input value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field>
        </div>

        {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">{err}</div>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            loading={busy}
            disabled={!picked.length || !fullName}
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
  const methodChoices = usePaymentMethods(useAuth().activeResort?.id);
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
      <Field label={`Record payment (${cur()})`}><Input type="number" min={1} value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} className="!w-28" /></Field>
      <Select value={method} onChange={(e) => setMethod(e.target.value)} className="!w-24">
        {methodChoices.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}
      </Select>
      <Button size="sm" onClick={pay} loading={busy} disabled={amount <= 0}>Add</Button>
    </div>
  );
}

function DetailDrawer({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const { isStaff, isAgent, isManagement, activeResort } = useAuth();
  const { push } = useToast();
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const { submit } = useOutbox();

  const detailQ = useApi(keys.booking(id), () => client.bookings.get(id));
  const b: BookingDetail | null = detailQ.data ?? null;

  // the resort's own settings barely change; caching them for an hour means
  // opening ten bookings in a row is ten requests, not twenty
  const settingsQ = useApi(
    keys.resort(activeResort?.id),
    () => api<{ agentPaymentHours?: number }>(`/resorts/${activeResort!.id}`),
    { enabled: !!activeResort, staleTime: 3_600_000 },
  );
  const payHours = settingsQ.data ? (settingsQ.data.agentPaymentHours ?? 48) : null;

  const load = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: keys.booking(id) });
  }, [qc, id]);

  // agent payment deadline flag
  const latePayment =
    b && b.agent && b.due > 0 && ["PENDING", "CONFIRMED"].includes(b.state) && payHours != null && b.checkIn
      ? (() => {
          const deadline = new Date(new Date(b.checkIn!).getTime() - payHours! * 3_600_000);
          const hoursLeft = Math.round((new Date(b.checkIn!).getTime() - Date.now()) / 3_600_000);
          return { deadlinePassed: Date.now() >= deadline.getTime(), hoursLeft, deadline };
        })()
      : null;

  async function approveLate() {
    setBusy(true);
    try {
      await api(`/bookings/${id}/approve-late`, { method: "POST", body: {} });
      push("Late payment approved — agent notified");
      await load();
      onChanged();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function transition(to: string) {
    setBusy(true);
    try {
      /**
       * Check-in and check-out cannot wait for a connection: a guest is
       * standing at the counter. When the network is down these go to the
       * outbox and the desk keeps moving; everything else on this screen still
       * requires a connection, because it can wait.
       */
      const queueable = to === "CHECKED_IN" || to === "CHECKED_OUT";
      const { queued } = queueable
        ? await submit({
            kind: to === "CHECKED_IN" ? "checkin" : "checkout",
            label: `${to === "CHECKED_IN" ? "Check in" : "Check out"} ${b?.code ?? `#${id}`}`,
            path: `/bookings/${id}/transition`,
            body: { to },
          })
        : (await api(`/bookings/${id}/transition`, { method: "POST", body: { to } }), { queued: false });

      if (queued) {
        push(`Saved on this device — it will sync when the connection returns`);
        await load();
        onChanged();
        return;
      }
      push(`Booking ${to.replace(/_/g, " ").toLowerCase()}`);
      if (to === "CHECKED_OUT" && !b?.invoiceNo) {
        try {
          await api(`/bookings/${id}/invoice`, { method: "POST" });
          push("Invoice generated — opening print view");
        } catch {
          push("Checked out (invoice generation failed)", "err");
        }
        await load();
        onChanged();
        window.open(`/invoice/${id}?print=1`, "_blank");
        return;
      }
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
            <span className="text-slate-500">Rent</span><span className="font-medium">{money(b.rent)}</span>
            <span className="text-slate-500">Discount</span><span>{money(b.discount)}</span>
            <span className="text-slate-500">Paid</span><span className="text-green-700">{money(b.paid)}</span>
            <span className="text-slate-500">Due</span><span className="font-bold text-red-700">{money(b.due)}</span>
          </div>
        </div>
      </div>

      {b.agentPricing && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-3">
          <div className="mb-1 text-xs font-medium text-brand-900">Your price</div>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
            <span className="text-slate-600">
              Guest pays <b className="text-slate-900">{money(b.agentPricing.actual)}</b>
            </span>
            <span className="text-slate-600">
              Your commission{" "}
              <b className="text-slate-900">
                {money(b.agentPricing.commission)}
                <span className="ml-1 text-xs font-normal text-slate-400">
                  {b.agentPricing.commissionKind === "FLAT"
                    ? "flat"
                    : `${b.agentPricing.commissionRate}%`}
                </span>
              </b>
            </span>
            <span className="text-brand-900">
              You owe the resort <b>{money(b.agentPricing.agentPrice)}</b>
            </span>
          </div>
        </div>
      )}

      <div>
        <div className="mb-1 text-xs font-medium text-slate-500">Rooms</div>
        <div className="flex flex-wrap gap-1.5">
          {b.items.map((i) => (
            <span key={i.id} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">
              {i.room?.name ?? i.kind} · {money(i.unitPrice)}/night
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
                  <Td className="!py-1.5 text-right text-xs font-medium">{money(p.amount)}</Td>
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

      {latePayment && (
        <div className={`rounded-xl px-4 py-3 text-sm ${latePayment.deadlinePassed ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>
          <div className="font-bold">
            {latePayment.deadlinePassed
              ? `Full-payment deadline passed — ${money(b.due)} still due`
              : `Full payment due within ${latePayment.hoursLeft}h (deadline ${money(b.due)})`}
          </div>
          <div className="mt-0.5 text-xs">
            Agent bookings must be fully paid {payHours}h before check-in.
            {latePayment.deadlinePassed && isManagement && " You can approve late payment."}
          </div>
          {latePayment.deadlinePassed && isManagement && (
            <Button size="sm" className="mt-2" onClick={approveLate} loading={busy}>
              Approve late payment
            </Button>
          )}
        </div>
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
          <>
            <a
              href={`/invoice/${b.id}?print=1`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              title="Open invoice and print / save as PDF"
            >
              <FileDown className="mr-1.5 inline h-3.5 w-3.5" /> Invoice PDF {b.invoiceNo}
            </a>
            <Button
              size="sm"
              variant="ghost"
              loading={busy}
              onClick={async () => {
                try {
                  await api(`/bookings/${b.id}/email-invoice`, { method: "POST", body: {} });
                  push("Invoice emailed to guest");
                } catch (ex) {
                  push((ex as Error).message, "err");
                }
              }}
              title="Email invoice to the guest"
            >
              Email invoice
            </Button>
          </>
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
  const { activeResort, setActiveResort, me } = useAuth();
  const qc = useQueryClient();
  const params = useSearchParams();
  const handoff = useMemo(() => bookingHandoff(params), [params]);
  const focusId = handoff.focusId;
  const preset = {
    roomId: handoff.roomId,
    checkIn: handoff.checkIn,
    checkOut: handoff.checkOut,
  };

  /**
   * Arriving for a different resort than the one on screen.
   *
   * An agent searching across the resorts they sell clicks "Book here" on one
   * of them; the resort in the URL is the resort they chose. Without this the
   * page quietly built the form for whichever resort happened to be active,
   * which is the worst kind of wrong — a booking made at the wrong hotel, with
   * nothing on screen to say so.
   */
  useEffect(() => {
    if (!handoff.resortId || handoff.resortId === activeResort?.id) return;
    const target = me?.resorts?.map((r) => r.resort).find((r) => r.id === handoff.resortId);
    if (target) setActiveResort(target);
  }, [handoff.resortId, activeResort?.id, me, setActiveResort]);
  const [state, setState] = useState("");
  const [source, setSource] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [presetOn, setPresetOn] = useState(false);
  useEffect(() => {
    if (handoff.openNew) {
      setPresetOn(true);
      setShowNew(true);
    }
  }, [handoff.openNew]);
  const [openId, setOpenId] = useState<number | null>(null);

  const filters = { state, source, group, from, to };
  const listQ = useApi(
    keys.bookings(activeResort?.id, filters),
    () =>
      client.bookings.list({
        resortId: activeResort!.id,
        take: 100,
        state: state || undefined,
        source: source || undefined,
        group: group || undefined,
        from: from || undefined,
        to: to || undefined,
      }),
    // the previous filter's rows stay on screen while the next set loads, so
    // changing a filter does not blank the table the clerk is reading from
    { enabled: !!activeResort, placeholderData: (prev) => prev },
  );
  const rows: BookingRow[] = listQ.data?.rows ?? [];
  const total = listQ.data?.total ?? 0;
  const loading = listQ.isPending;

  /**
   * Anything that changes a booking changes what the desk sees elsewhere: the
   * day sheet's grid, today's arrivals, the outstanding dues. Naming them once
   * here is why those screens are right when the clerk walks to them.
   */
  const load = useCallback(async () => {
    const rid = activeResort?.id;
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["bookings", rid] }),
      qc.invalidateQueries({ queryKey: ["day-sheet", rid] }),
      qc.invalidateQueries({ queryKey: ["today", rid] }),
      qc.invalidateQueries({ queryKey: ["dues", rid] }),
      qc.invalidateQueries({ queryKey: ["calendar", rid] }),
      qc.invalidateQueries({ queryKey: ["availability", rid] }),
    ]);
  }, [qc, activeResort]);

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
        {listQ.error ? (
          <ErrorState error={listQ.error} />
        ) : loading ? (
          <Skeleton rows={8} />
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
                    <Td className="text-right font-semibold">{money(b.due)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <div className="text-xs text-slate-400">{filtered.length} of {total} bookings</div>

      <NewBookingModal open={showNew} preset={presetOn ? preset : null} onClose={() => setShowNew(false)} onCreated={() => void load()} />

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
