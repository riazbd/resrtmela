"use client";

import { money } from "@/lib/api";
import type { RoomAvail } from "@rh/shared";

/**
 * One room on the booking form's grid.
 *
 * There are two reasons a room cannot be sold for these dates and the grid
 * used to know only one of them. It greyed out a room whose nights were taken;
 * a room out of service has no taken nights, so it looked like any other free
 * room. Picking it cost the clerk the whole form — guest name, phone, NID,
 * advance — and then failed on submit with "One or more rooms missing/inactive
 * for this resort", which names no room and tells them nothing to do about it.
 *
 * So both reasons are drawn, and they are not drawn the same. Booked is red
 * and temporary: those nights are gone, the room is fine. Out of service is
 * amber and is about the room, not the dates — the same distinction the rooms
 * screen already makes, for the same reason.
 */
export function RoomChoice({ room, checked, onToggle }: {
  room: RoomAvail;
  checked: boolean;
  onToggle: (roomId: number) => void;
}) {
  const booked = room.busyNights.length > 0;
  const closed = room.status !== "ACTIVE";
  const sellable = !booked && !closed;

  return (
    <button
      disabled={!sellable}
      onClick={() => onToggle(room.roomId)}
      className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
        booked
          ? "cursor-not-allowed border-red-200 bg-red-50 text-red-400"
          : closed
            ? "cursor-not-allowed border-amber-200 bg-amber-50 text-amber-600"
            : checked
              ? "border-brand-500 bg-brand-50 text-brand-900 ring-1 ring-brand-500"
              : "border-slate-200 bg-white hover:border-brand-300"
      }`}
    >
      <div className="font-medium">{room.roomName}</div>
      {/* The agent's own rate comes from the server, which knows whether their
          terms are a percentage or a flat fee. This used to be worked out here
          as `rate × (1 − pct/100)`, which quietly showed a flat-fee agent the
          wrong price. */}
      <div className="text-[11px]">
        {room.agentRate != null ? (
          <>
            <span className="text-slate-400 line-through">{money(Number(room.baseRate))}</span>
            {" "}<span className="font-bold text-brand-700">{money(room.agentRate)}</span>
            <span className="text-slate-400"> your price</span>
          </>
        ) : (
          <>{money(Number(room.baseRate))}</>
        )}
        {/* booked wins the label: if a closed room somehow also has nights on
            it, the nights are the thing standing in the way today */}
        {booked ? ` · busy (${room.busyNights.length}n)` : closed ? " · out of service" : ""}
      </div>
    </button>
  );
}
