"use client";

import { useCallback, useEffect, useState } from "react";
import { api, dmy, type GuestRow } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Badge, Card, Empty, Input, Spinner, Td, Th } from "@/components/ui";

export default function GuestsPage() {
  const { activeResort, isStaff } = useAuth();
  const [rows, setRows] = useState<GuestRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeResort) return;
    setLoading(true);
    try {
      const qs = search ? `?search=${encodeURIComponent(search)}` : "";
      setRows(await api<GuestRow[]>(`/resorts/${activeResort.id}/guests${qs}`));
    } finally {
      setLoading(false);
    }
  }, [activeResort, search]);

  useEffect(() => {
    if (isStaff) void load();
  }, [load, isStaff]);

  if (!isStaff) return <Empty msg="Staff only" />;

  return (
    <Card
      title="Guest directory"
      action={
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or phone…"
          className="!w-60"
        />
      }
      className="!p-0"
    >
      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Empty msg="No guests found" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="border-b border-slate-100">
              <tr><Th>Guest</Th><Th>Phone</Th><Th>NID / Passport</Th><Th className="text-right">Bookings</Th><Th>Last stay</Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((g) => (
                <tr key={g.id} className="hover:bg-slate-50/50">
                  <Td className="font-medium">{g.fullName}</Td>
                  <Td className="text-xs">{g.phone}</Td>
                  <Td className="text-xs text-slate-400">{g.nidPassportNo ?? "—"}</Td>
                  <Td className="text-right">{g.bookingCount}</Td>
                  <Td className="text-xs">
                    {g.lastStay ? (
                      <span className="flex items-center gap-2">
                        {dmy(g.lastStay.checkIn)} → {dmy(g.lastStay.checkOut)}
                        <Badge value={g.lastStay.state} />
                      </span>
                    ) : (
                      "—"
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
