"use client";

import { useCallback, useEffect, useState } from "react";
import { api, guestCancel, bdt, dmy, type GuestTrip } from "@/lib/api";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Empty, Spinner, useToast } from "@/components/ui";

export default function GuestTripsPage() {
  const router = useRouter();
  const { push } = useToast();
  const [trips, setTrips] = useState<GuestTrip[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setTrips(null);
    try {
      setTrips(await api<GuestTrip[]>("/guest/bookings"));
    } catch {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  async function cancel(trip: GuestTrip) {
    if (!window.confirm(`Cancel ${trip.code}?`)) return;
    setBusy(true);
    try {
      await guestCancel(trip.id);
      push(`${trip.code} cancelled`);
      await load();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  if (trips === null) return <Spinner />;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900">My trips</h1>

      {trips.length === 0 && (
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-slate-500">No trips yet.</p>
          <a href="/book" className="mt-3 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Browse resorts
          </a>
        </div>
      )}

      <div className="mt-6 space-y-3">
        {trips.map((t) => (
          <div key={t.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold text-slate-900">{t.resortName ?? t.resort?.name}</div>
                <div className="text-xs text-slate-400">{t.code} · {dmy(t.checkIn)} → {dmy(t.checkOut)} · {t.rooms.join(", ")}</div>
                <div className="mt-1 text-sm">
                  {t.rent > 0 && <span>Rent ৳{t.rent.toLocaleString("en-IN")} </span>}
                  {t.discount > 0 && <span className="text-green-600">− ৳{t.discount.toLocaleString("en-IN")} </span>}
                  <b className={t.due > 0 ? "text-red-600" : "text-green-600"}>Due ৳{t.due.toLocaleString("en-IN")}</b>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge value={t.state} />
                <Badge value={t.paymentState} />
              </div>
            </div>
            {t.state === "PENDING" && (
              <div className="mt-2 text-right">
                <Button size="sm" variant="ghost" onClick={() => cancel(t)} loading={busy} className="!text-red-600">
                  Cancel
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
