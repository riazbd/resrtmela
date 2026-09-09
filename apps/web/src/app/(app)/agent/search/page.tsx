"use client";

import { useState } from "react";
import Link from "next/link";
import { api, money } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi, keys } from "@/lib/query";
import { Button, Card, Empty, Field, Input, Spinner, Td, Th } from "@/components/ui";
import { Table } from "@/components/patterns";
import { ErrorState } from "@/components/error-state";
import { MapPin, Search } from "lucide-react";
import type { AgencyRoomOffer } from "@rh/shared";

/**
 * What is free between two dates.
 *
 * An agent on the phone is asked "have you got anything for the 12th to the
 * 14th", and the answer spans every resort they sell. Before this they opened
 * each resort in turn and read a grid — which is why the answer took a call
 * back, and sometimes never came.
 *
 * Where the resort shows its rates to agents, the agent's own price sits
 * beside the published one, so the number quoted to the guest and the number
 * owed to the resort are both on screen at the moment of quoting.
 */

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (iso: string, days: number) =>
  new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);

export default function RoomSearchPage() {
  const { role } = useAuth();
  const [draft, setDraft] = useState({ from: today(), to: plusDays(today(), 1) });
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);

  const { data, isLoading, error, stale } = useApi<AgencyRoomOffer[]>(
    keys.agentRooms(range?.from ?? "", range?.to ?? ""),
    () => api<AgencyRoomOffer[]>(`/agent/rooms?from=${range!.from}&to=${range!.to}`),
    { enabled: !!range },
  );

  if (role !== "AGENT") return <Empty msg="Agents only" />;

  const nights = range
    ? Math.round(
        (new Date(`${range.to}T00:00:00Z`).getTime() - new Date(`${range.from}T00:00:00Z`).getTime()) /
          86_400_000,
      )
    : 0;
  const free = (data ?? []).reduce((s, r) => s + r.rooms.length, 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Find a room</h1>
        <p className="text-sm text-slate-500">
          Pick the dates; see what is free across every resort you sell.
        </p>
      </div>

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Check in">
            <Input
              type="date"
              value={draft.from}
              onChange={(e) => {
                const from = e.target.value;
                setDraft({ from, to: draft.to > from ? draft.to : plusDays(from, 1) });
              }}
            />
          </Field>
          <Field label="Check out">
            <Input
              type="date"
              value={draft.to}
              min={plusDays(draft.from, 1)}
              onChange={(e) => setDraft({ ...draft, to: e.target.value })}
            />
          </Field>
          <Button onClick={() => setRange({ ...draft })} disabled={draft.to <= draft.from}>
            <Search className="mr-1 h-4 w-4" /> Search
          </Button>
        </div>
      </Card>

      {!range && (
        <Empty msg="Choose your dates and search" />
      )}

      {range && error && <ErrorState error={error as Error} />}
      {range && isLoading && !data && <Spinner label="Looking across your resorts…" />}

      {range && data && (
        <>
          <p className="text-sm text-slate-600">
            <b>{free}</b> room{free === 1 ? "" : "s"} free for {nights} night{nights === 1 ? "" : "s"},
            across <b>{data.length}</b> resort{data.length === 1 ? "" : "s"}.
          </p>

          {data.length === 0 && <Empty msg="Nothing free on those dates" />}

          {data.map((offer) => (
            <Card
              key={offer.resort.id}
              className="!p-0"
              title={offer.resort.name}
              action={
                <Link
                  href={`/bookings?resortId=${offer.resort.id}&checkIn=${range.from}&checkOut=${range.to}&new=1`}
                  className="text-xs font-semibold text-brand-700 hover:underline"
                >
                  Book here →
                </Link>
              }
            >
              {offer.resort.location && (
                <div className="flex items-center gap-1 px-4 pt-2 text-xs text-slate-500">
                  <MapPin className="h-3 w-3" /> {offer.resort.location}
                </div>
              )}
              <Table minWidth={520}>
                <thead className="border-b border-slate-100">
                  <tr>
                    <Th>Room</Th>
                    <Th className="text-right">Published rate</Th>
                    <Th className="text-right">Your price</Th>
                    <Th className="text-right">{nights} nights</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {offer.rooms.map((r) => (
                    <tr key={r.roomId}>
                      <Td className="font-medium">{r.roomName}</Td>
                      <Td className="text-right text-slate-500">{money(r.baseRate)}</Td>
                      <Td className="text-right font-semibold text-brand-700">
                        {r.agentRate != null ? money(r.agentRate) : "—"}
                      </Td>
                      <Td className="text-right font-medium">
                        {money((r.agentRate ?? r.baseRate) * nights)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          ))}

          {stale && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              These were the rooms free {stale}. Availability changes — confirm before you promise it.
            </div>
          )}
        </>
      )}
    </div>
  );
}
