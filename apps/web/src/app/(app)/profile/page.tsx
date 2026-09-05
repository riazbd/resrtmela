"use client";

import { useEffect, useState } from "react";
import { api, bdt, dmy, type BookingRow } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Badge, Card, Empty, Spinner, Stat, Td, Th } from "@/components/ui";

/** Agent portal home — doc §3 "Agent Portal": profile, commission, my stats. */
export default function ProfilePage() {
  const { me, activeResort, isAgent } = useAuth();
  const [rows, setRows] = useState<BookingRow[] | null>(null);

  useEffect(() => {
    if (!activeResort || !isAgent) return;
    api<{ rows: BookingRow[] }>(`/bookings?resortId=${activeResort.id}&take=200`)
      .then((r) => setRows(r.rows))
      .catch(() => setRows([]));
  }, [activeResort, isAgent]);

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
        </>
      )}
    </div>
  );
}
