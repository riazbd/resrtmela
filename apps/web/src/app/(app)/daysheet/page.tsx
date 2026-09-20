"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { client, money } from "@/lib/api";
import { useApi, keys } from "@/lib/query";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { Badge, Button, Card, Spinner, Stat, Th, Td } from "@/components/ui";
import { ErrorState, Skeleton } from "@/components/error-state";
import { DateNav, Table } from "@/components/patterns";
import { todayIn, addDaysIso } from "@/lib/resort-dates";
import { lastNightLabel } from "@rh/shared";

export default function DaySheetPage() {
  const { activeResort, isStaff } = useAuth();
  const t = useT();
  const router = useRouter();
  const [date, setDate] = useState(() => todayIn(activeResort?.timezone));

  const { data: sheet, isPending, error } = useApi(
    keys.daySheet(activeResort?.id, date),
    () => client.daySheet(activeResort!.id, date),
    { enabled: isStaff && !!activeResort },
  );

  if (!isStaff) return <Spinner />;
  if (error) return <ErrorState error={error} />;
  if (isPending || !sheet) return <Skeleton rows={8} />;

  const strip = sheet.strip;

  return (
    <div className="space-y-4">
      {/* date navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateNav value={date} onChange={setDate} todayLabel={t("ds.today")} />
        <div className="text-sm font-semibold text-slate-600">
          {new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
            weekday: "long", day: "numeric", month: "long", year: "numeric",
          })}
        </div>
      </div>

      {/* day strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label={t("ds.balanceDue")} value={money(strip.balanceDue)} tone={strip.balanceDue > 0 ? "red" : "default"} />
        <Stat label={t("ds.nightRevenue")} value={money(strip.revenue)} tone="green" />
        <Stat label={t("ds.expenses")} value={money(strip.expenses)} tone="amber" />
        <Stat label={t("ds.occupancy")} value={`${strip.occupancy}/${strip.totalRooms}`} />
        {/* last nights, not departures — see the room chips below */}
        <Stat label={`${t("ds.arrivals")} / ${t("ds.lastNights")}`} value={`${strip.arrivals} / ${strip.departures}`} />
      </div>

      {/* the register */}
      <Card className="!p-0">
        <Table minWidth={720}>
            <thead className="border-b border-slate-200">
              <tr className="bg-slate-50">
                <Th className="!py-2.5">{t("ds.room")}</Th>
                <Th className="!py-2.5">{t("ds.guest")}</Th>
                <Th className="!py-2.5">{t("ds.due")}</Th>
                <Th className="!py-2.5">{t("ds.revenue")}</Th>
                <Th className="!py-2.5" />
              </tr>
            </thead>
            <tbody>
              {sheet.rooms.map((r) => {
                const c = r.cell;
                return (
                  <tr
                    key={r.roomId}
                    className={`border-b border-slate-50 ${
                      c.mode === "oos"
                        ? "bg-slate-100/60 text-slate-400"
                        : c.mode === "booked"
                          ? "cursor-pointer hover:bg-brand-50/40"
                          : "cursor-pointer hover:bg-emerald-50/40"
                    }`}
                    /**
                     * Two of the three states go somewhere.
                     *
                     * A taken room opens its booking. A free one opens the
                     * new-booking form already filled in with that room and
                     * that night — `bookingHandoff` has expected this page
                     * as a caller since it was written, and its own comment
                     * said so, but nothing here ever sent it: a clerk with
                     * somebody at the counter had already decided the room
                     * and the night and was made to choose both again.
                     */
                    onClick={() => {
                      if (c.mode === "booked" && c.bookingId) {
                        router.push(`/bookings?id=${c.bookingId}`);
                      } else if (c.mode === "available") {
                        router.push(
                          `/bookings?roomId=${r.roomId}&checkIn=${date}&checkOut=${addDaysIso(date, 1)}`,
                        );
                      }
                    }}
                  >
                    <Td className="!py-3">
                      <div className="font-semibold text-slate-800">{r.name}</div>
                      <div className="text-[11px] text-slate-400">{r.capacity ?? "—"} {t("ds.pax")}</div>
                    </Td>
                    <Td>
                      {c.mode === "oos" ? (
                        <span className="text-xs italic">{t("ds.oos")}</span>
                      ) : c.mode === "available" ? (
                        // no longer only a label: the row is a way to sell it
                        <span className="text-xs text-emerald-600">{t("ds.available")}</span>
                      ) : (
                        <div>
                          <div className="font-medium text-slate-800">{c.guestName}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] text-slate-400">{c.code}</span>
                            {c.state && <Badge value={c.state} />}
                            {c.arrives && (
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                                {t("ds.arrives")}
                              </span>
                            )}
                            {/*
                              This said "Departs today" for a guest leaving
                              the next morning — the register is a grid of
                              nights and the last one is the night before.
                              A clerk who reads it as today sells the room
                              twice. `lastNightLabel` names the morning, and
                              the phone draws the same words from the same
                              function.
                            */}
                            {c.departs && (
                              <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-700">
                                {lastNightLabel(addDaysIso(date, 1), date)}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </Td>
                    <Td>
                      {c.due !== null && c.due !== undefined ? (
                        <span className={`font-bold ${c.due > 0 ? "text-red-700" : "text-green-700"}`}>
                          {money(c.due)}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </Td>
                    <Td className="text-slate-600">{c.revenue != null ? money(c.revenue) : "—"}</Td>
                    <Td className="text-right">
                      {c.mode === "booked" && (
                        <span className="text-xs text-brand-600">→</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
        </Table>
      </Card>

      <p className="text-[11px] text-slate-400">
        {t("ds.subtitle")}
      </p>
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brand-500 ${props.className ?? ""}`}
    />
  );
}
