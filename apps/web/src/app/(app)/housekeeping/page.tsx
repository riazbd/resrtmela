"use client";

import { useState } from "react";
import { Table } from "@/components/patterns";
import { client, dmy } from "@/lib/api";
import {
  housekeepingLabel,
  housekeepingOrder,
  nextHousekeepingState,
  type HousekeepingRow,
} from "@rh/shared";
import { useApi, useQueryClient } from "@/lib/query";
import { useAuth } from "@/lib/auth";
import { Badge, Button, Card, Empty, Spinner, Stat, Td, Th, useToast } from "@/components/ui";
import { ErrorState } from "@/components/error-state";

/**
 * Which rooms are ready.
 *
 * **The copy, not the original.** Everywhere else in this platform the
 * console is the full screen and the phone is the reduction; here it is
 * the other way round, because a housekeeper is on the second floor
 * holding a mop and a manager is reading over their shoulder from an
 * office. The phone's list is the design and this is the same list on a
 * wider screen.
 *
 * The order and the words come from `@rh/shared` — `housekeepingOrder`
 * and `nextHousekeepingState` — so a room the phone calls urgent is the
 * room this calls urgent.
 */
export default function HousekeepingPage() {
  const { activeResort, can } = useAuth();
  const { push } = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<number | null>(null);

  const mayMove = can("housekeeping.manage");
  const enabled = !!activeResort;
  const listQ = useApi<HousekeepingRow[]>(
    ["housekeeping", activeResort?.id],
    () => client.rooms.housekeeping(activeResort!.id),
    { enabled },
  );

  if (!activeResort) return <Empty msg="Choose a resort" />;
  if (listQ.error) return <ErrorState error={listQ.error as Error} />;
  if (listQ.isPending) return <Spinner />;

  const rows = housekeepingOrder(listQ.data ?? []);
  const toClean = rows.filter((r) => r.housekeeping === "DIRTY").length;
  const underway = rows.filter((r) => r.housekeeping === "CLEANING").length;
  const ready = rows.filter((r) => r.housekeeping === "CLEAN").length;

  async function move(room: HousekeepingRow) {
    const next = nextHousekeepingState(room.housekeeping);
    setBusy(room.id);
    try {
      await client.rooms.setHousekeeping(room.id, next.to);
      await qc.invalidateQueries({ queryKey: ["housekeeping"] });
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(null);
    }
  }

  /** Why a room is where it is in the list — the ordering alone is silent. */
  const why = (room: HousekeepingRow) => {
    if (room.housekeeping !== "DIRTY") return null;
    if (room.departedToday && room.arrivingToday) {
      return "Left this morning, someone arriving tonight";
    }
    if (room.departedToday) return "Left this morning";
    return null;
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Housekeeping</h1>
        <p className="text-sm text-slate-500">
          Which rooms are ready to sell, and which still need doing. A guest
          checking out marks their room automatically.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="To clean"
          value={String(toClean)}
          tone={toClean > 0 ? "red" : "green"}
        />
        <Stat label="Being cleaned" value={String(underway)} tone="amber" />
        <Stat label="Ready" value={String(ready)} tone="green" />
      </div>

      <Card className="!p-0" title={`${rows.length} room${rows.length === 1 ? "" : "s"}`}>
        {rows.length === 0 ? (
          <Empty msg="No rooms — add the resort's rooms and they appear here" />
        ) : toClean === 0 && underway === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-slate-500">
            Everything is ready. The list fills again as guests leave.
          </div>
        ) : null}

        {rows.length > 0 && (
          <Table minWidth={720}>
            <thead className="border-b border-slate-100">
              <tr>
                <Th>Room</Th>
                <Th>State</Th>
                <Th>Last moved</Th>
                {mayMove && <Th />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((room) => {
                const reason = why(room);
                return (
                  <tr key={room.id}>
                    <Td>
                      <div className="font-medium">{room.name}</div>
                      <div className="text-xs text-slate-500">
                        {reason ?? room.roomTypeName ?? "—"}
                        {room.status === "ACTIVE" ? "" : " · out of service"}
                      </div>
                    </Td>
                    <Td>
                      <Badge value={housekeepingLabel(room.housekeeping)} />
                    </Td>
                    <Td className="text-xs text-slate-500">
                      {/* null where a check-out did it, and no person did that */}
                      {room.housekeepingBy
                        ? `${room.housekeepingBy}${room.housekeepingAt ? ` · ${dmy(room.housekeepingAt)}` : ""}`
                        : room.housekeepingAt
                          ? dmy(room.housekeepingAt)
                          : "—"}
                    </Td>
                    {mayMove && (
                      <Td className="text-right">
                        <Button
                          size="sm"
                          variant={room.housekeeping === "DIRTY" ? "primary" : "ghost"}
                          disabled={busy === room.id}
                          onClick={() => move(room)}
                        >
                          {nextHousekeepingState(room.housekeeping).label}
                        </Button>
                      </Td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
