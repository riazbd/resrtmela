"use client";

import { useEffect, useState } from "react";
import { client, type BookingDetail } from "@/lib/api";
import { Button, Field, Input, Modal, useToast } from "@/components/ui";
import { DiscountInput } from "@/components/discount-input";
import { bookingChanges, canEditStay, type DiscountKind } from "@rh/shared";
import { useAuth } from "@/lib/auth";

/**
 * Changing a booking after it was made.
 *
 * `PATCH /bookings/:id` has taken dates, head count, discount and remarks all
 * along, and nothing on the console called it — so a guest staying a night
 * longer meant cancelling and booking again, and losing the payment ledger
 * with it.
 *
 * Only what changed is sent, and working out what that is belongs to
 * `bookingChanges` in `@rh/shared` — two of its comparisons have a wrong
 * answer that looks right, and the phone's edit screen makes the same two.
 * The API re-checks availability when the dates move and answers a clash
 * with the room and the night, which is shown here as it came.
 *
 * Who may open this at all is `canEditStay`. It was nobody's rule until
 * 2026-09-20: `bookings.service.ts` refuses a front desk once the guest is
 * in the room, and this modal was offered on a checked-in booking to
 * anybody with `bookings.edit` — so a clerk could change the dates, press
 * Save, and be told "Front desk can edit only Pending/Confirmed" with the
 * form still full.
 */
export function EditBookingModal({ booking, open, onClose, onSaved }: {
  booking: BookingDetail;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { push } = useToast();
  const day = (d: string | null) => (d ? d.slice(0, 10) : "");
  const [checkIn, setCheckIn] = useState(day(booking.checkIn));
  const [checkOut, setCheckOut] = useState(day(booking.checkOut));
  const [adults, setAdults] = useState(booking.adults);
  const [children, setChildren] = useState(booking.children);
  const [discount, setDiscount] = useState<{ kind: DiscountKind; value: number }>({
    kind: (booking.discountKind ?? "FLAT") as DiscountKind,
    value: booking.discountValue ?? booking.discount,
  });
  const [remarks, setRemarks] = useState(booking.remarks ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { role } = useAuth();
  const verdict = canEditStay({ role: role ?? "", state: booking.state });

  // opening it again starts from the booking as it is now, not from a draft
  useEffect(() => {
    if (!open) return;
    setCheckIn(day(booking.checkIn));
    setCheckOut(day(booking.checkOut));
    setAdults(booking.adults);
    setChildren(booking.children);
    setDiscount({ kind: (booking.discountKind ?? "FLAT") as DiscountKind, value: booking.discountValue ?? booking.discount });
    setRemarks(booking.remarks ?? "");
    setErr(null);
  }, [open, booking]);

  async function save() {
    const body = bookingChanges(
      booking,
      { checkIn, checkOut, adults, children, discount: discount.value, discountKind: discount.kind, remarks },
      { mayChangeDiscount: verdict.mayChangeDiscount },
    );
    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await client.bookings.update(booking.id, body);
      push(`Booking ${booking.code} updated`);
      onSaved();
      onClose();
    } catch (ex) {
      setErr((ex as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Edit ${booking.code}`}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Check-in"><Input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} /></Field>
          <Field label="Check-out"><Input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} /></Field>
          <Field label="Adults"><Input type="number" min={1} value={adults} onChange={(e) => setAdults(Number(e.target.value))} /></Field>
          <Field label="Children"><Input type="number" min={0} value={children} onChange={(e) => setChildren(Number(e.target.value))} /></Field>
        </div>
        {verdict.mayChangeDiscount && (
          <DiscountInput kind={discount.kind} value={discount.value} onChange={setDiscount} />
        )}
        {verdict.mayChangeDiscount && discount.kind === "PERCENT" && (
          <p className="-mt-2 text-[11px] text-slate-400">
            A percentage of the rooms and extra persons, worked out again if the dates change.
          </p>
        )}
        <Field label="Remarks"><Input value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field>

        {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">{err}</div>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={save}>Save changes</Button>
        </div>
      </div>
    </Modal>
  );
}
