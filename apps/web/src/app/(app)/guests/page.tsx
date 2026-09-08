"use client";

import { useState } from "react";
import { client, dmy } from "@/lib/api";
import { useApi, keys } from "@/lib/query";
import { useAuth } from "@/lib/auth";
import { Badge, Card, Empty, Input, Spinner, Td, Th } from "@/components/ui";
import { ErrorState } from "@/components/error-state";
import { useDebounced } from "@/lib/use-debounced";

export default function GuestsPage() {
  const { activeResort, isStaff } = useAuth();
  const [search, setSearch] = useState("");
  // typing "rahman" used to be six requests; the last one is the only answer
  const debounced = useDebounced(search, 300);

  const { data, isPending, error } = useApi(
    keys.guests(activeResort?.id, debounced),
    () => client.guests.list(activeResort!.id, { search: debounced || undefined }),
    { enabled: isStaff && !!activeResort, placeholderData: (prev) => prev },
  );
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  if (!isStaff) return <Empty msg="Staff only" />;
  if (error) return <ErrorState error={error} />;

  return (
    <Card
      title={total > rows.length ? `Guest directory — showing ${rows.length} of ${total}` : "Guest directory"}
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
      {isPending ? (
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
