"use client";

import { useEffect, useState } from "react";
import { api, money, type BookingDetail } from "@/lib/api";
import { Button, Field, Input, Modal, Select, useToast } from "@/components/ui";
import { STAY_CHARGE_KINDS, STAY_CHARGE_LABELS, isStayChargeKind, type StayChargeKind } from "@rh/shared";

function ErrorLine({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">{msg}</div>;
}

/**
 * Who actually arrived.
 *
 * A booking for two turns up as four. The desk is asked at the moment it can
 * answer — pressing Check in — and the count replaces the booked one, charged
 * for the whole stay at the rate of the room each person sleeps in. Also
 * opened later, from the booking, when somebody joins mid-stay.
 *
 * Setting the count needs a connection; the check-in itself can still be
 * queued offline as before, so a dead network never keeps a guest standing
 * at the counter.
 */
export function ArrivalModal({ booking, open, mode, onClose, onChanged, onCheckIn }: {
  booking: BookingDetail;
  open: boolean;
  /** "checkin" confirms the arrival; "adjust" only changes the count */
  mode: "checkin" | "adjust";
  onClose: () => void;
  onChanged: () => void | Promise<void>;
  onCheckIn: () => void | Promise<void>;
}) {
  const [persons, setPersons] = useState(booking.extraPersons ?? 0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { push } = useToast();

  useEffect(() => {
    if (!open) return;
    setPersons(booking.extraPersons ?? 0);
    setErr(null);
  }, [open, booking.extraPersons]);

  async function confirm() {
    setBusy(true);
    setErr(null);
    try {
      if (persons !== (booking.extraPersons ?? 0)) {
        await api(`/bookings/${booking.id}/extra-persons`, { method: "POST", body: { persons } });
        push(persons > (booking.extraPersons ?? 0) ? `Extra persons: ${persons} — added to the bill` : `Extra persons: ${persons}`);
        await onChanged();
      }
      onClose();
      if (mode === "checkin") await onCheckIn();
    } catch (ex) {
      setErr((ex as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={mode === "checkin" ? `Check in ${booking.code}` : `Guests — ${booking.code}`}>
      <div className="space-y-4">
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Booked for <b>{booking.adults}</b> adult{booking.adults === 1 ? "" : "s"}
          {booking.children > 0 && <> and <b>{booking.children}</b> child{booking.children === 1 ? "" : "ren"}</>}
          {(booking.extraPersons ?? 0) > 0 && <> + <b>{booking.extraPersons}</b> extra</>}.
        </div>
        <Field
          label="Extra persons"
          hint="Everyone beyond what the rooms were booked for. Charged for every night of the stay, at each room's own rate."
        >
          <Input
            type="number"
            min={0}
            value={persons}
            onChange={(e) => setPersons(Math.max(0, Math.floor(Number(e.target.value))))}
          />
        </Field>
        <ErrorLine msg={err} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={confirm}>{mode === "checkin" ? "Check in" : "Save"}</Button>
        </div>
      </div>
    </Modal>
  );
}

/** The charge lines on a booking, with what each was for. */
export function chargeLines(booking: BookingDetail) {
  return booking.items.filter((i) => i.kind === "CHARGE");
}

/**
 * What the guest owes before they leave.
 *
 * Water from the minibar, a broken lamp, a smoking fine: the desk had nowhere
 * to put any of it, so it went on paper that never reached the invoice. They
 * are added here, the bill underneath moves as they are, and Check out is the
 * last button — because checking out issues the invoice, and an issued
 * invoice does not take another line.
 */
export function DepartureModal({ booking, open, mode, onClose, onChanged, onCheckOut }: {
  booking: BookingDetail;
  open: boolean;
  /** "checkout" ends with the check-out; "charges" only adds lines */
  mode: "checkout" | "charges";
  onClose: () => void;
  onChanged: () => void | Promise<void>;
  onCheckOut: () => void | Promise<void>;
}) {
  const { push } = useToast();
  const [kind, setKind] = useState<StayChargeKind>(STAY_CHARGE_KINDS[0]);
  const [label, setLabel] = useState("");
  const [qty, setQty] = useState(1);
  const [amount, setAmount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLabel("");
    setQty(1);
    setAmount(0);
    setErr(null);
  }, [open]);

  async function add() {
    setBusy(true);
    setErr(null);
    try {
      await api(`/bookings/${booking.id}/charges`, { method: "POST", body: { kind, label, qty, amount } });
      push(`${STAY_CHARGE_LABELS[kind]} added — ${money(amount * qty)}`);
      setLabel("");
      setQty(1);
      setAmount(0);
      await onChanged();
    } catch (ex) {
      setErr((ex as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(itemId: number) {
    setBusy(true);
    setErr(null);
    try {
      await api(`/bookings/${booking.id}/charges/${itemId}`, { method: "DELETE" });
      await onChanged();
    } catch (ex) {
      setErr((ex as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const lines = chargeLines(booking);

  return (
    <Modal open={open} onClose={onClose} title={mode === "checkout" ? `Check out ${booking.code}` : `Charges — ${booking.code}`}>
      <div className="space-y-4">
        <div>
          <div className="mb-1.5 text-xs font-medium text-slate-500">Services, damage &amp; fines</div>
          {lines.length === 0 ? (
            <div className="text-xs text-slate-400">Nothing charged beyond the stay.</div>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {lines.map((l) => (
                <li key={l.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                    {isStayChargeKind(l.chargeKind) ? STAY_CHARGE_LABELS[l.chargeKind] : "Charge"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-slate-700">
                    {l.label}
                    {l.qty > 1 && <span className="ml-1 text-xs text-slate-400">× {l.qty}</span>}
                  </span>
                  <span className="tabular-nums text-slate-800">{money((l.unitPrice ?? 0) * l.qty)}</span>
                  <button
                    type="button"
                    onClick={() => remove(l.id)}
                    disabled={busy}
                    className="rounded px-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    aria-label={`Remove ${l.label}`}
                    title="Remove"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[8rem_1fr_4.5rem_7rem]">
          <Field label="Kind">
            <Select value={kind} onChange={(e) => setKind(e.target.value as StayChargeKind)}>
              {STAY_CHARGE_KINDS.map((k) => (
                <option key={k} value={k}>{STAY_CHARGE_LABELS[k]}</option>
              ))}
            </Select>
          </Field>
          <Field label="What for">
            <Input
              value={label}
              maxLength={160}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={kind === "SERVICE" ? "Mineral water" : kind === "DAMAGE" ? "Broken lamp" : "Smoking in the room"}
            />
          </Field>
          <Field label="Qty">
            <Input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value))))} />
          </Field>
          <Field label="Amount each">
            <Input type="number" min={0} value={amount} onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))} />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button size="sm" variant="ghost" loading={busy} disabled={!label.trim() || !(amount > 0)} onClick={add}>
            + Add charge
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center">
          <div>
            <div className="text-[10px] font-medium uppercase text-slate-400">Total</div>
            <div className="font-bold tabular-nums text-slate-900">{money(booking.total)}</div>
          </div>
          <div>
            <div className="text-[10px] font-medium uppercase text-slate-400">Paid</div>
            <div className="font-bold tabular-nums text-green-700">{money(booking.paid - (booking.refunded ?? 0))}</div>
          </div>
          <div>
            <div className="text-[10px] font-medium uppercase text-slate-400">Due</div>
            <div className="font-bold tabular-nums text-red-700">{money(booking.due)}</div>
          </div>
        </div>

        <ErrorLine msg={err} />

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{mode === "checkout" ? "Cancel" : "Done"}</Button>
          {mode === "checkout" && (
            <Button
              loading={busy}
              onClick={async () => {
                onClose();
                await onCheckOut();
              }}
            >
              Check out
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
