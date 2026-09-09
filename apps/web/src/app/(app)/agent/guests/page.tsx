"use client";

import { useState } from "react";
import { api, money, dmy } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi, keys } from "@/lib/query";
import { useDebounced } from "@/lib/use-debounced";
import { Card, Empty, Input, Spinner, Stat, Td, Th } from "@/components/ui";
import { Table } from "@/components/patterns";
import { ErrorState } from "@/components/error-state";
import type { AgencyGuestRow } from "@rh/shared";

/**
 * Everyone the agency has served.
 *
 * "The agency", not the person signed in: an owner who has to ask each of
 * their own staff who they sold to does not have a customer list, they have
 * several private ones. Bookings made by anyone on the team appear here.
 *
 * Contact details are shown in full, unlike on a resort's own booking. The
 * mask there stops an agency harvesting a resort's guests; these are the
 * agency's own clients, whose numbers are already in their phone.
 */
export default function AgencyGuestsPage() {
  const { role, can } = useAuth();
  const [search, setSearch] = useState("");
  const q = useDebounced(search, 300);

  const { data, isLoading, error, stale } = useApi<{ rows: AgencyGuestRow[]; total: number }>(
    keys.agentGuests(q),
    () => api<{ rows: AgencyGuestRow[]; total: number }>(`/agent/guests${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  );

  if (role !== "AGENT") return <Empty msg="Agents only" />;
  if (!can("agent.guests.view")) return <Empty msg="You do not have access to the guest list" />;
  if (error) return <ErrorState error={error as Error} />;

  const rows = data?.rows ?? [];
  const lifetime = rows.reduce((s, r) => s + r.spend, 0);
  const stays = rows.reduce((s, r) => s + r.bookings, 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Guests</h1>
        <p className="text-sm text-slate-500">Everyone this agency has booked a room for.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Guests" value={String(data?.total ?? 0)} />
        <Stat label="Stays sold" value={String(stays)} />
        <Stat label="Booked through you" value={money(lifetime)} />
      </div>

      <Card
        className="!p-0"
        title="Guest list"
        action={
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone or email…"
            className="!w-64"
          />
        }
      >
        {isLoading && !data ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <Empty msg={q ? "Nobody matches that" : "No guests yet — they appear here once you sell a stay"} />
        ) : (
          <Table minWidth={820}>
            <thead className="border-b border-slate-100">
              <tr>
                <Th>Guest</Th>
                <Th>Contact</Th>
                <Th>Where</Th>
                <Th className="text-right">Stays</Th>
                <Th className="text-right">Nights</Th>
                <Th className="text-right">Value</Th>
                <Th>Last stay</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((g) => (
                <tr key={g.id}>
                  <Td className="font-medium">{g.fullName}</Td>
                  <Td className="text-xs text-slate-500">
                    <div>{g.phone}</div>
                    {g.email && <div>{g.email}</div>}
                  </Td>
                  <Td className="text-xs text-slate-500">{g.resorts.join(", ") || "—"}</Td>
                  <Td className="text-right">{g.bookings}</Td>
                  <Td className="text-right text-slate-500">{g.nights}</Td>
                  <Td className="text-right font-medium">{money(g.spend)}</Td>
                  <Td className="text-xs text-slate-500">{g.lastStay ? dmy(g.lastStay) : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {stale && (
          <div className="border-t border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
            Showing what was saved on this device {stale} — you appear to be offline.
          </div>
        )}
      </Card>
    </div>
  );
}
