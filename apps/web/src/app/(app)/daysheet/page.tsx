"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, bdt } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { Badge, Button, Card, Spinner, Stat, Th, Td } from "@/components/ui";

interface Cell {
  mode: "oos" | "available" | "booked";
  bookingId?: number;
  code?: string;
  state?: string;
  guestName?: string;
  due?: number | null;
  revenue?: number | null;
  arrives?: boolean;
  departs?: boolean;
}
interface RoomRow {
  roomId: number;
  name: string;
  capacity: number | null;
  status: string;
  cell: Cell;
}
interface DaySheet {
  date: string;
  rooms: RoomRow[];
  strip: {
    balanceDue: number; revenue: number; expenses: number;
    arrivals: number; departures: number; occupancy: number; totalRooms: number;
  };
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function DaySheetPage() {
  const { activeResort, isStaff } = useAuth();
  const t = useT();
  const router = useRouter();
  const [date, setDate] = useState(() => iso(new Date()));
  const [sheet, setSheet] = useState<DaySheet | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeResort) return;
    setLoading(true);
    try {
      setSheet(await api<DaySheet>(`/resorts/${activeResort.id}/day-sheet?date=${date}`));
    } finally {
      setLoading(false);
    }
  }, [activeResort, date]);

  useEffect(() => {
    if (isStaff) void load();
  }, [load, isStaff]);

  function shift(days: number) {
    const d = new Date(date + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    setDate(iso(d));
  }

  if (!isStaff) return <Spinner />;
  if (loading || !sheet) return <Spinner />;

  const strip = sheet.strip;

  return (
    <div className="space-y-4">
      {/* date navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => shift(-1)}>←</Button>
          <Button variant="ghost" size="sm" onClick={() => setDate(iso(new Date()))}>{t("ds.today")}</Button>
          <Button variant="ghost" size="sm" onClick={() => shift(1)}>→</Button>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="!w-40" />
        </div>
        <div className="text-sm font-semibold text-slate-600">
          {new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
            weekday: "long", day: "numeric", month: "long", year: "numeric",
          })}
        </div>
      </div>

      {/* day strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label={t("ds.balanceDue")} value={bdt(strip.balanceDue)} tone={strip.balanceDue > 0 ? "red" : "default"} />
        <Stat label={t("ds.nightRevenue")} value={bdt(strip.revenue)} tone="green" />
        <Stat label={t("ds.expenses")} value={bdt(strip.expenses)} tone="amber" />
        <Stat label={t("ds.occupancy")} value={`${strip.occupancy}/${strip.totalRooms}`} />
        <Stat label={`${t("ds.arrivals")} / ${t("ds.departures")}`} value={`${strip.arrivals} / ${strip.departures}`} />
      </div>

      {/* the register */}
      <Card className="!p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
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
                          : "hover:bg-slate-50/50"
                    }`}
                    onClick={() => c.mode === "booked" && c.bookingId && router.push(`/bookings?id=${c.bookingId}`)}
                  >
                    <Td className="!py-3">
                      <div className="font-semibold text-slate-800">{r.name}</div>
                      <div className="text-[11px] text-slate-400">{r.capacity ?? "—"} {t("ds.pax")}</div>
                    </Td>
                    <Td>
                      {c.mode === "oos" ? (
                        <span className="text-xs italic">{t("ds.oos")}</span>
                      ) : c.mode === "available" ? (
                        <span className="text-xs text-slate-300">{t("ds.available")}</span>
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
                            {c.departs && (
                              <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-700">
                                {t("ds.departs")}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </Td>
                    <Td>
                      {c.due !== null && c.due !== undefined ? (
                        <span className={`font-bold ${c.due > 0 ? "text-red-700" : "text-green-700"}`}>
                          {bdt(c.due)}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </Td>
                    <Td className="text-slate-600">{c.revenue != null ? bdt(c.revenue) : "—"}</Td>
                    <Td className="text-right">
                      {c.mode === "booked" && (
                        <span className="text-xs text-brand-600">→</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
