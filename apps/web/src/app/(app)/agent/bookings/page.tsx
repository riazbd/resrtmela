"use client";

import { useState } from "react";
import { BookingsGlance } from "@/components/glance";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { client, money, dmy } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi, keys } from "@/lib/query";
import { useDebounced } from "@/lib/use-debounced";
import { Badge, Card, Empty, Input, Select, Spinner, Td, Th } from "@/components/ui";
import { Table } from "@/components/patterns";
import { ErrorState } from "@/components/error-state";
import { BOOKING_STATES, bookingStateLabel, type AgencyBookingRow } from "@rh/shared";

/**
 * What this agency has sold.
 *
 * The resort's own booking list is one resort's, and an agency sells across
 * several — so until this screen existed an agency could raise an invoice for
 * a stay and have no list to find the stay on. The owner asked for it by the
 * name it has here: my bookings.
 *
 * "This agency", not "me": an owner sees what their staff sold, which is the
 * same rule the guest list and the API's own filter already run on.
 *
 * A row opens the booking in the console's own detail drawer rather than in a
 * second one written here — one screen showing a booking, so the two cannot
 * come to disagree about what it costs.
 */
export default function AgencyBookingsPage() {
  const { role, can, me } = useAuth();
  const router = useRouter();
  // the resorts this agency sells, for the filter — the session already holds
  // them, so the screen asks the server for nothing extra. Read before the
  // guards below, because a hook cannot live after a return.
  const resorts = (me?.resorts ?? []).map((r) => ({ id: r.resort.id, name: r.resort.name }));
  const [search, setSearch] = useState("");
  const [state, setState] = useState("");
  const [resortId, setResortId] = useState("");
  const q = useDebounced(search, 300);

  const filters = { search: q || undefined, state: state || undefined, resortId: resortId ? Number(resortId) : undefined };
  const { data, isLoading, error, stale } = useApi(
    keys.agentBookings(filters),
    () => client.agent.bookings({ ...filters, take: 200 }),
  );

  if (role !== "AGENT") return <Empty msg="Agents only" />;
  if (!can("agent.book")) return <Empty msg="You do not have access to the agency's bookings" />;
  if (error) return <ErrorState error={error as Error} />;

  const rows: AgencyBookingRow[] = data?.rows ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">My bookings</h1>
        <p className="text-sm text-slate-500">
          Every stay this agency has booked, across every resort you sell.
        </p>
      </div>

      <BookingsGlance rows={rows} total={data?.total ?? 0} />

      <Card
        className="!p-0"
        title="Bookings"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={resortId} onChange={(e) => setResortId(e.target.value)} className="!w-48">
              <option value="">Every resort</option>
              {resorts.map((r) => (
                <option key={r.id} value={String(r.id)}>{r.name}</option>
              ))}
            </Select>
            <Select value={state} onChange={(e) => setState(e.target.value)} className="!w-40">
              <option value="">Any status</option>
              {BOOKING_STATES.map((s) => (
                <option key={s} value={s}>{bookingStateLabel(s)}</option>
              ))}
            </Select>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Guest, phone or code…"
              className="!w-56"
            />
          </div>
        }
      >
        {isLoading && !data ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <Empty
            msg={
              q || state || resortId
                ? "Nothing matches that"
                : "No bookings yet — the stays you sell appear here"
            }
          />
        ) : (
          <Table minWidth={980}>
            <thead className="border-b border-slate-100">
              <tr>
                <Th>Code</Th>
                <Th>Guest</Th>
                <Th>Resort</Th>
                <Th>Nights</Th>
                <Th>Rooms</Th>
                <Th>Status</Th>
                <Th>Booked by</Th>
                <Th className="text-right">Due</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((b) => (
                <tr
                  key={b.id}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() =>
                    router.push(`/bookings?id=${b.id}${b.resort ? `&resortId=${b.resort.id}` : ""}`)
                  }
                >
                  <Td className="font-medium text-brand-700">{b.code}</Td>
                  <Td>
                    <div>{b.guest?.fullName}</div>
                    <div className="text-[11px] text-slate-400">{b.guest?.phone}</div>
                  </Td>
                  <Td className="text-xs">{b.resort?.name ?? "—"}</Td>
                  <Td className="text-xs">
                    {dmy(b.checkIn)} → {dmy(b.checkOut)}
                    <div className="text-[11px] text-slate-400">{b.nights}n</div>
                  </Td>
                  <Td className="text-xs">{b.rooms.join(", ")}</Td>
                  <Td><Badge value={b.state} /></Td>
                  {/* on an agency's own list the firm is itself, so the
                      useful half is which of its people sold it */}
                  <Td className="text-xs text-slate-500">{b.agent ?? "—"}</Td>
                  <Td className="text-right font-semibold">{money(b.due)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {stale && (
          <div className="border-t border-slate-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
            Showing what was saved on this device {stale} — you appear to be offline.
          </div>
        )}
      </Card>

      <div className="text-xs text-slate-400">
        {rows.length} of {data?.total ?? 0} · looking for a room instead?{" "}
        <Link href="/agent/search" className="text-brand-700 underline-offset-2 hover:underline">
          Find a room
        </Link>
      </div>
    </div>
  );
}
