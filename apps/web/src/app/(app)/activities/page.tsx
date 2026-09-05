"use client";

import { useCallback, useEffect, useState } from "react";
import { api, bdt, dmy } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  Badge, Button, Card, Empty, Field, Input, Modal, Select, Spinner, Td, Th, useToast,
} from "@/components/ui";

const CATEGORIES = ["TOUR", "WATER_SPORTS", "WELLNESS", "DINING", "ENTERTAINMENT", "OTHER"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Schedule {
  id?: number;
  weekday: number;
  startTime: string;
  endTime: string;
  capacity: number;
  active?: boolean;
}

interface Activity {
  id: number;
  name: string;
  category: string;
  basePrice: number;
  durationMin: number;
  minPerSlot: number;
  maxPerSlot: number;
  description: string | null;
  active: boolean;
  schedules: Schedule[];
  upcomingSlots: number;
  nextSlot: string | null;
}

interface Slot {
  id: number;
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookedCount: number;
  remaining: number;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function ActivitiesPage() {
  const { activeResort, isManagement, isStaff } = useAuth();
  const { push } = useToast();
  const [rows, setRows] = useState<Activity[] | null>(null);
  const [selected, setSelected] = useState<Activity | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Activity> & { schedules: Schedule[] } | null>(null);
  const [genFrom, setGenFrom] = useState(iso(new Date()));
  const [genTo, setGenTo] = useState(iso(new Date(Date.now() + 14 * 86400000)));
  const [busy, setBusy] = useState(false);

  const canManage = isManagement;

  const load = useCallback(async () => {
    if (!activeResort) return;
    setRows(null);
    setRows(await api<Activity[]>(`/resorts/${activeResort.id}/activities`));
  }, [activeResort]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadSlots = useCallback(async (a: Activity) => {
    setSlots(null);
    const from = iso(new Date());
    const to = iso(new Date(Date.now() + 14 * 86400000));
    setSlots(await api<Slot[]>(`/resorts/${activeResort!.id}/activities/${a.id}/slots?from=${from}&to=${to}&futureOnly=true`));
  }, [activeResort]);

  useEffect(() => {
    if (selected) void loadSlots(selected);
  }, [selected, loadSlots]);

  async function saveActivity() {
    if (!activeResort || !editing) return;
    setBusy(true);
    try {
      const body = {
        name: editing.name,
        category: editing.category ?? "TOUR",
        basePrice: Number(editing.basePrice ?? 0),
        durationMin: Number(editing.durationMin ?? 60),
        minPerSlot: Number(editing.minPerSlot ?? 1),
        maxPerSlot: Number(editing.maxPerSlot ?? 10),
        description: editing.description ?? undefined,
      };
      if (editing.id) {
        await api(`/activities/${editing.id}`, { method: "PATCH", body });
        await api(`/activities/${editing.id}/schedules`, {
          method: "PUT",
          body: { rows: editing.schedules.map(({ weekday, startTime, endTime, capacity, active }) => ({ weekday, startTime, endTime, capacity, active: active ?? true })) },
        });
      } else {
        const created = await api<{ id: number }>(`/resorts/${activeResort.id}/activities`, { method: "POST", body });
        if (editing.schedules.length) {
          await api(`/activities/${created.id}/schedules`, {
            method: "PUT",
            body: { rows: editing.schedules.map(({ weekday, startTime, endTime, capacity, active }) => ({ weekday, startTime, endTime, capacity, active: active ?? true })) },
          });
        }
      }
      push("Activity saved");
      setEditOpen(false);
      await load();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    if (!selected) return;
    setBusy(true);
    try {
      const r = await api<{ created: number; matched: number; totalSlots: number }>(
        `/activities/${selected.id}/generate`,
        { method: "POST", body: { from: genFrom, to: genTo } },
      );
      push(`Generated ${r.created} slots (${r.matched} schedule matches, ${r.totalSlots} total)`);
      await load();
      await loadSlots(selected);
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(a: Activity) {
    try {
      await api(`/activities/${a.id}`, { method: "PATCH", body: { active: !a.active } });
      await load();
    } catch (ex) {
      push((ex as Error).message, "err");
    }
  }

  async function deleteSlot(slot: Slot) {
    if (!window.confirm("Delete this empty future slot?")) return;
    try {
      await api(`/activity-slots/${slot.id}`, { method: "DELETE" });
      if (selected) await loadSlots(selected);
    } catch (ex) {
      push((ex as Error).message, "err");
    }
  }

  function openNew() {
    setEditing({
      name: "", category: "TOUR", basePrice: 800, durationMin: 60,
      minPerSlot: 1, maxPerSlot: 12, description: "", schedules: [{ weekday: 5, startTime: "10:00", endTime: "11:00", capacity: 12 }],
    });
    setEditOpen(true);
  }

  function openEdit(a: Activity) {
    setEditing({ ...a, schedules: a.schedules.length ? a.schedules : [] });
    setEditOpen(true);
  }

  if (!isStaff && !canManage) return <Empty msg="Staff only" />;
  if (rows === null) return <Spinner />;

  return (
    <div className="space-y-4">
      <Card
        title="Activities"
        action={canManage ? <Button size="sm" onClick={openNew}>+ New activity</Button> : undefined}
        className="!p-0"
      >
        {rows.length === 0 ? (
          <Empty msg="No activities yet — add one and set a weekly schedule" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="border-b border-slate-100">
                <tr><Th>Activity</Th><Th>Price</Th><Th>Duration</Th><Th>Weekly schedule</Th><Th>Upcoming</Th><Th>Status</Th><Th className="text-right">Actions</Th></tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map((a) => (
                  <tr key={a.id} className={`hover:bg-slate-50/50 ${selected?.id === a.id ? "bg-brand-50/50" : ""}`}>
                    <Td>
                      <button className="font-medium text-brand-700 hover:underline" onClick={() => setSelected(a)}>
                        {a.name}
                      </button>
                      <div className="text-[11px] text-slate-400">{a.category.replace(/_/g, " ")}</div>
                    </Td>
                    <Td>{bdt(a.basePrice)}</Td>
                    <Td className="text-xs">{a.durationMin}m</Td>
                    <Td className="text-xs">
                      {a.schedules.length === 0
                        ? <span className="text-slate-400">none</span>
                        : a.schedules.map((s) => `${DAYS[s.weekday]} ${s.startTime}`).join(", ")}
                    </Td>
                    <Td className="text-xs">{a.upcomingSlots}{a.nextSlot ? <div className="text-[11px] text-slate-400">next {dmy(a.nextSlot)}</div> : null}</Td>
                    <Td><Badge value={a.active ? "CONFIRMED" : "CANCELLED"} /></Td>
                    <Td className="text-right">
                      {canManage && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => openEdit(a)}>Edit</Button>{" "}
                          <Button size="sm" variant="subtle" onClick={() => toggleActive(a)}>{a.active ? "Pause" : "Activate"}</Button>
                        </>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selected && (
        <Card
          title={`Slot occupancy — ${selected.name} (next 14 days)`}
          action={
            canManage ? (
              <div className="flex items-end gap-2">
                <Field label="From"><Input type="date" value={genFrom} onChange={(e) => setGenFrom(e.target.value)} className="!w-36" /></Field>
                <Field label="To"><Input type="date" value={genTo} onChange={(e) => setGenTo(e.target.value)} className="!w-36" /></Field>
                <Button size="sm" onClick={generate} loading={busy}>Generate slots</Button>
              </div>
            ) : undefined
          }
          className="!p-0"
        >
          {slots === null ? (
            <Spinner />
          ) : slots.length === 0 ? (
            <Empty msg="No upcoming slots — set a schedule and generate" />
          ) : (
            <div className="max-h-[360px] overflow-auto">
              <table className="w-full min-w-[560px]">
                <thead className="sticky top-0 border-b border-slate-100 bg-white">
                  <tr><Th>When</Th><Th>Booked</Th><Th>Remaining</Th><Th /></tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {slots.map((s) => (
                    <tr key={s.id}>
                      <Td className="text-xs">
                        {new Date(s.startsAt).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </Td>
                      <Td className="text-xs">{s.bookedCount}/{s.capacity}</Td>
                      <Td>
                        <span className={`text-xs font-semibold ${s.remaining === 0 ? "text-red-600" : "text-green-700"}`}>
                          {s.remaining} left
                        </span>
                      </Td>
                      <Td className="text-right">
                        {canManage && s.bookedCount === 0 && (
                          <Button size="sm" variant="ghost" onClick={() => deleteSlot(s)}>Delete</Button>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* create / edit modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={editing?.id ? "Edit activity" : "New activity"} wide>
        {editing && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name"><Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
              <Field label="Category">
                <Select value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })}>
                  {CATEGORIES.map((c) => <option key={c}>{c.replace(/_/g, " ")}</option>)}
                </Select>
              </Field>
              <Field label="Price (৳/person)"><Input type="number" min={0} value={editing.basePrice ?? 0} onChange={(e) => setEditing({ ...editing, basePrice: Number(e.target.value) })} /></Field>
              <Field label="Duration (min)"><Input type="number" min={15} value={editing.durationMin ?? 60} onChange={(e) => setEditing({ ...editing, durationMin: Number(e.target.value) })} /></Field>
              <Field label="Min per slot"><Input type="number" min={1} value={editing.minPerSlot ?? 1} onChange={(e) => setEditing({ ...editing, minPerSlot: Number(e.target.value) })} /></Field>
              <Field label="Max per slot"><Input type="number" min={1} value={editing.maxPerSlot ?? 10} onChange={(e) => setEditing({ ...editing, maxPerSlot: Number(e.target.value) })} /></Field>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600">Weekly schedule</span>
                <Button
                  size="sm" variant="ghost"
                  onClick={() => setEditing({ ...editing, schedules: [...editing.schedules, { weekday: 5, startTime: "10:00", endTime: "11:00", capacity: 12 }] })}
                >
                  + Add row
                </Button>
              </div>
              {editing.schedules.length === 0 && <div className="text-xs text-slate-400">No recurring times — generate manually later</div>}
              <div className="space-y-2">
                {editing.schedules.map((s, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <Field label="Day">
                      <Select
                        value={s.weekday}
                        onChange={(e) => {
                          const rows2 = [...editing.schedules];
                          rows2[i] = { ...s, weekday: Number(e.target.value) };
                          setEditing({ ...editing, schedules: rows2 });
                        }}
                        className="!w-24"
                      >
                        {DAYS.map((d, di) => <option key={d} value={di}>{d}</option>)}
                      </Select>
                    </Field>
                    <Field label="Start"><Input value={s.startTime} onChange={(e) => { const r = [...editing.schedules]; r[i] = { ...s, startTime: e.target.value }; setEditing({ ...editing, schedules: r }); }} className="!w-24" placeholder="10:00" /></Field>
                    <Field label="End"><Input value={s.endTime} onChange={(e) => { const r = [...editing.schedules]; r[i] = { ...s, endTime: e.target.value }; setEditing({ ...editing, schedules: r }); }} className="!w-24" placeholder="11:00" /></Field>
                    <Field label="Seats"><Input type="number" min={1} value={s.capacity} onChange={(e) => { const r = [...editing.schedules]; r[i] = { ...s, capacity: Number(e.target.value) }; setEditing({ ...editing, schedules: r }); }} className="!w-20" /></Field>
                    <Button size="sm" variant="ghost" onClick={() => setEditing({ ...editing, schedules: editing.schedules.filter((_, x) => x !== i) })}>✕</Button>
                  </div>
                ))}
              </div>
            </div>

            <Field label="Description"><Input value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></Field>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button onClick={saveActivity} loading={busy} disabled={!editing.name}>Save</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
