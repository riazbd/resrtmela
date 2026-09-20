"use client";

import { client, money } from "@/lib/api";
import { useApi, keys } from "@/lib/query";
import { bookingStateLabel, stayRange, type BookingRow, type GuestRow } from "@rh/shared";
import { Badge, Empty, Modal, Spinner, Td, Th } from "@/components/ui";
import { ErrorState } from "@/components/error-state";
import { Table } from "@/components/patterns";

/**
 * Everything one guest has ever stayed for.
 *
 * The guests page has been a table and nothing else: a clerk could see
 * that somebody had stayed four times and had no way to ask which four.
 * "Have they been before, and did they pay?" is the question the counter
 * actually asks, and the answer was two screens and a search away.
 *
 * **There is no `GET /guests/:id`**, and this does not add one. A guest
 * is found by their phone number — it is what `GET /bookings?search=`
 * matches on — so the stays are read off the bookings list narrowed to
 * that number. The phone's guest screen is assembled the same way, from
 * the same two routes, which is why neither client needed a new endpoint
 * to answer a question the data could already answer.
 *
 * A guest with no phone gets nothing to search on, and the row says so
 * rather than opening an empty drawer that reads as "never stayed".
 */
export function GuestStays({
  guest,
  resortId,
  onClose,
  onOpenBooking,
}: {
  guest: GuestRow | null;
  resortId: number | undefined;
  onClose: () => void;
  onOpenBooking: (id: number) => void;
}) {
  const phone = guest?.phone?.trim() || "";

  const staysQ = useApi(
    keys.bookings(resortId, `guest:${phone}`),
    () => client.bookings.list({ resortId: resortId!, search: phone, take: 50 }),
    { enabled: !!guest && !!resortId && !!phone },
  );

  const rows: BookingRow[] = staysQ.data?.rows ?? [];
  // summed from the rows on this page, and labelled as such: the bookings
  // route sends no total of what one guest owes
  const owed = rows.reduce((sum, b) => sum + (b.due ?? 0), 0);

  return (
    <Modal open={!!guest} onClose={onClose} title={guest?.fullName ?? "Guest"} wide>
      {!guest ? null : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
            <span>{guest.phone || "no phone"}</span>
            {guest.nidPassportNo && <span>NID / Passport {guest.nidPassportNo}</span>}
            <span>
              {guest.bookingCount} stay{guest.bookingCount === 1 ? "" : "s"}
            </span>
            {owed > 0 && (
              <span className="font-medium text-red-700">{money(owed)} owed on these</span>
            )}
          </div>

          {!phone ? (
            <Empty msg="This guest has no phone number, which is what their stays are found by." />
          ) : staysQ.error ? (
            <ErrorState error={staysQ.error} />
          ) : staysQ.isPending ? (
            <Spinner />
          ) : rows.length === 0 ? (
            <Empty msg="No bookings found for this number." />
          ) : (
            <Table minWidth={640}>
              <thead className="border-b border-slate-100">
                <tr>
                  <Th>Booking</Th>
                  <Th>Stay</Th>
                  <Th>Rooms</Th>
                  <Th>State</Th>
                  <Th className="text-right">Total</Th>
                  <Th className="text-right">Due</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map((b) => (
                  <tr
                    key={b.id}
                    className="cursor-pointer hover:bg-brand-50/40"
                    onClick={() => onOpenBooking(b.id)}
                  >
                    <Td className="font-medium text-brand-700">{b.code}</Td>
                    <Td className="text-xs">{stayRange(b.checkIn, b.checkOut)}</Td>
                    <Td className="text-xs">{b.rooms?.join(", ") ?? "—"}</Td>
                    <Td>
                      <Badge value={b.state} />
                    </Td>
                    <Td className="text-right tabular-nums">{money(b.total ?? b.rent)}</Td>
                    <Td
                      className={`text-right tabular-nums ${(b.due ?? 0) > 0 ? "font-medium text-red-700" : "text-slate-400"}`}
                    >
                      {money(b.due ?? 0)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}

          {/* `bookingStateLabel` rather than the raw enum, so this reads the
              way every other state in both clients reads */}
          {guest.lastStay && (
            <p className="text-[11px] text-slate-400">
              Last stay {stayRange(guest.lastStay.checkIn, guest.lastStay.checkOut)} ·{" "}
              {bookingStateLabel(guest.lastStay.state)}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
