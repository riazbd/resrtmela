"use client";

import { useCallback, useEffect, useState } from "react";
import { api, bdt, dmy, type RatePlan, type Room, type RoomType } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Badge, Button, Card, Empty, Field, Input, Modal, Select, Spinner, Td, Th, useToast } from "@/components/ui";

export default function RoomsPage() {
  const { activeResort, isManagement } = useAuth();
  const { push } = useToast();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [types, setTypes] = useState<RoomType[]>([]);
  const [plans, setPlans] = useState<RatePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [addRoom, setAddRoom] = useState(false);
  const [addType, setAddType] = useState(false);
  const [addPlan, setAddPlan] = useState(false);

  const canEdit = isManagement;

  const load = useCallback(async () => {
    if (!activeResort) return;
    setLoading(true);
    try {
      const [r, t, p] = await Promise.all([
        api<Room[]>(`/resorts/${activeResort.id}/rooms`),
        api<RoomType[]>(`/resorts/${activeResort.id}/room-types`),
        api<RatePlan[]>(`/resorts/${activeResort.id}/rate-plans`),
      ]);
      setRooms(r);
      setTypes(t);
      setPlans(p);
    } finally {
      setLoading(false);
    }
  }, [activeResort]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleRoom(room: Room) {
    try {
      await api(`/rooms/${room.id}`, {
        method: "PATCH",
        body: { status: room.status === "ACTIVE" ? "OUT_OF_SERVICE" : "ACTIVE" },
      });
      push(`${room.name} → ${room.status === "ACTIVE" ? "Out of service" : "Active"}`);
      void load();
    } catch (ex) {
      push((ex as Error).message, "err");
    }
  }

  async function editRate(room: Room) {
    const v = window.prompt(`New base rate for ${room.name} (৳)`, String(Number(room.baseRate)));
    if (!v) return;
    try {
      await api(`/rooms/${room.id}`, { method: "PATCH", body: { baseRate: Number(v) } });
      push(`${room.name} rate updated`);
      void load();
    } catch (ex) {
      push((ex as Error).message, "err");
    }
  }

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <Card
        title="Rooms"
        action={canEdit ? <Button size="sm" variant="ghost" onClick={() => setAddRoom(true)}>+ Add room</Button> : undefined}
        className="!p-0"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="border-b border-slate-100"><tr><Th>Room</Th><Th>Type</Th><Th>Base rate</Th><Th>Status</Th>{canEdit && <Th className="text-right">Actions</Th>}</tr></thead>
            <tbody className="divide-y divide-slate-50">
              {rooms.map((r) => (
                <tr key={r.id}>
                  <Td className="font-medium">{r.name}</Td>
                  <Td className="text-xs">{r.roomType?.name}</Td>
                  <Td>{bdt(r.baseRate)}</Td>
                  <Td><Badge value={r.status === "ACTIVE" ? "CONFIRMED" : "CANCELLED"} /></Td>
                  {canEdit && (
                    <Td className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => editRate(r)}>Rate</Button>{" "}
                      <Button size="sm" variant={r.status === "ACTIVE" ? "subtle" : "primary"} onClick={() => toggleRoom(r)}>
                        {r.status === "ACTIVE" ? "Out of service" : "Activate"}
                      </Button>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Room types"
        action={canEdit ? <Button size="sm" variant="ghost" onClick={() => setAddType(true)}>+ Add type</Button> : undefined}
      >
        <div className="flex flex-wrap gap-2">
          {types.map((t) => (
            <div key={t.id} className="rounded-lg border border-slate-200 px-3 py-2">
              <div className="text-sm font-medium">{t.name}</div>
              <div className="text-[11px] text-slate-400">{t.maxAdults}A · {t.maxChildren}C{t.amenities?.length ? ` · ${(t.amenities as string[]).join(", ")}` : ""}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card
        title="Seasonal rate plans"
        action={canEdit ? <Button size="sm" variant="ghost" onClick={() => setAddPlan(true)}>+ Add plan</Button> : undefined}
      >
        {plans.length === 0 ? (
          <Empty msg="No seasonal rates — base rates apply year-round" />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100"><tr><Th>Type</Th><Th>From</Th><Th>To</Th><Th className="text-right">Price/night</Th></tr></thead>
            <tbody className="divide-y divide-slate-50">
              {plans.map((p) => (
                <tr key={p.id}>
                  <Td className="text-xs">{p.roomType?.name}</Td>
                  <Td className="text-xs">{dmy(p.dateFrom)}</Td>
                  <Td className="text-xs">{dmy(p.dateTo)}</Td>
                  <Td className="text-right font-medium">{bdt(p.price)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <AddRoomTypeModal open={addType} onClose={() => setAddType(false)} onDone={() => void load()} />
      <AddPlanModal open={addPlan} onClose={() => setAddPlan(false)} onDone={() => void load()} types={types} />
      <AddRoomModal open={addRoom} onClose={() => setAddRoom(false)} onDone={() => void load()} types={types} />
    </div>
  );
}

function AddRoomModal({ open, onClose, onDone, types }: {
  open: boolean; onClose: () => void; onDone: () => void; types: RoomType[];
}) {
  const { activeResort } = useAuth();
  const { push } = useToast();
  const [name, setName] = useState("");
  const [typeId, setTypeId] = useState<number | "">("");
  const [rate, setRate] = useState(0);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!activeResort || !typeId) return;
    setBusy(true);
    try {
      await api(`/resorts/${activeResort.id}/rooms`, { method: "POST", body: { name, roomTypeId: typeId, baseRate: rate } });
      push("Room added");
      onDone();
      onClose();
      setName(""); setRate(0);
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add room">
      <div className="space-y-3">
        <Field label="Room name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tulip" /></Field>
        <Field label="Room type">
          <Select value={typeId} onChange={(e) => setTypeId(Number(e.target.value))}>
            <option value="">Select…</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <Field label="Base rate (৳/night)"><Input type="number" min={0} value={rate || ""} onChange={(e) => setRate(Number(e.target.value))} /></Field>
        <div className="flex justify-end"><Button onClick={submit} loading={busy} disabled={!name || !typeId || rate <= 0}>Add</Button></div>
      </div>
    </Modal>
  );
}

function AddRoomTypeModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { activeResort } = useAuth();
  const { push } = useToast();
  const [name, setName] = useState("");
  const [a, setA] = useState(2);
  const [c, setC] = useState(0);
  const [amen, setAmen] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!activeResort) return;
    setBusy(true);
    try {
      await api(`/resorts/${activeResort.id}/room-types`, {
        method: "POST",
        body: { name, maxAdults: a, maxChildren: c, amenities: amen ? amen.split(",").map((s) => s.trim()) : undefined },
      });
      push("Room type added");
      onDone();
      onClose();
      setName(""); setAmen("");
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add room type">
      <div className="space-y-3">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Max adults"><Input type="number" min={1} value={a} onChange={(e) => setA(Number(e.target.value))} /></Field>
          <Field label="Max children"><Input type="number" min={0} value={c} onChange={(e) => setC(Number(e.target.value))} /></Field>
        </div>
        <Field label="Amenities" hint="comma separated"><Input value={amen} onChange={(e) => setAmen(e.target.value)} placeholder="AC, WiFi, Balcony" /></Field>
        <div className="flex justify-end"><Button onClick={submit} loading={busy} disabled={!name}>Add</Button></div>
      </div>
    </Modal>
  );
}

function AddPlanModal({ open, onClose, onDone, types }: {
  open: boolean; onClose: () => void; onDone: () => void; types: RoomType[];
}) {
  const { activeResort } = useAuth();
  const { push } = useToast();
  const [typeId, setTypeId] = useState<number | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [price, setPrice] = useState(0);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!activeResort || !typeId) return;
    setBusy(true);
    try {
      await api(`/resorts/${activeResort.id}/rate-plans`, {
        method: "POST",
        body: { roomTypeId: typeId, dateFrom: from, dateTo: to, price },
      });
      push("Rate plan added");
      onDone();
      onClose();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add seasonal rate plan">
      <div className="space-y-3">
        <Field label="Room type">
          <Select value={typeId} onChange={(e) => setTypeId(Number(e.target.value))}>
            <option value="">Select…</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
        <Field label="Price (৳/night)"><Input type="number" min={0} value={price || ""} onChange={(e) => setPrice(Number(e.target.value))} /></Field>
        <div className="flex justify-end"><Button onClick={submit} loading={busy} disabled={!typeId || !from || !to || price <= 0}>Add</Button></div>
      </div>
    </Modal>
  );
}
