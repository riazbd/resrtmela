"use client";

import { useCallback, useEffect, useState } from "react";
import { Table } from "@/components/patterns";
import { api, client, money, dmy, type RatePlan, type Room, type RoomType, cur } from "@/lib/api";
import { useApi, keys, useQueryClient } from "@/lib/query";
import { useAuth } from "@/lib/auth";
import { Badge, Button, Card, Empty, Field, Input, Modal, Select, Spinner, Td, Th, useToast } from "@/components/ui";
import { ErrorState, Skeleton } from "@/components/error-state";

export default function RoomsPage() {
  const { activeResort, can } = useAuth();
  const { push } = useToast();
  const qc = useQueryClient();
  const [addRoom, setAddRoom] = useState(false);
  const [addType, setAddType] = useState(false);
  const [editType, setEditType] = useState<RoomType | null>(null);
  const [editRoom, setEditRoom] = useState<Room | null>(null);
  const [addPlan, setAddPlan] = useState(false);

  // the permission the API actually requires, not the account's kind. A role
  // built with `rooms.manage` could not touch this screen's buttons, and a
  // manager without it was shown buttons the server then refused.
  const canEdit = can("rooms.manage");
  const canDelete = can("rooms.delete");

  const enabled = !!activeResort;
  const roomsQ = useApi(keys.rooms(activeResort?.id), () => client.rooms.list(activeResort!.id), { enabled });
  const typesQ = useApi(keys.roomTypes(activeResort?.id), () => client.rooms.types(activeResort!.id), { enabled });
  const plansQ = useApi(keys.ratePlans(activeResort?.id), () => client.rooms.ratePlans(activeResort!.id), { enabled });

  const rooms = roomsQ.data ?? [];
  const types = typesQ.data ?? [];
  const plans = plansQ.data ?? [];
  const loading = roomsQ.isPending || typesQ.isPending || plansQ.isPending;
  const error = roomsQ.error ?? typesQ.error ?? plansQ.error;

  /**
   * Inventory is read by the calendar, the day sheet and the booking form, so
   * a change here has to reach all of them. Invalidating by key does that;
   * re-fetching into local state would have left the other screens stale.
   */
  const load = useCallback(async () => {
    const rid = activeResort?.id;
    await Promise.all([
      qc.invalidateQueries({ queryKey: keys.rooms(rid) }),
      qc.invalidateQueries({ queryKey: keys.roomTypes(rid) }),
      qc.invalidateQueries({ queryKey: keys.ratePlans(rid) }),
      qc.invalidateQueries({ queryKey: ["availability", rid] }),
      qc.invalidateQueries({ queryKey: ["calendar", rid] }),
      qc.invalidateQueries({ queryKey: ["day-sheet", rid] }),
    ]);
  }, [qc, activeResort]);

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

  /**
   * What this room takes, asked one room at a time.
   *
   * Extra persons used to be a switch and a rate on the room *type*, so a type
   * covering nine rooms of different sizes could not describe any of them, and
   * the resort left it off — which is why the "Extra persons" box never once
   * appeared on a booking form.
   */
  async function editExtraPersons(room: Room) {
    const maxRaw = window.prompt(
      `How many extra persons can ${room.name} take? (0 for none)`,
      String(room.extraPersonMax ?? 0),
    );
    if (maxRaw === null) return;
    const max = Math.max(0, Math.floor(Number(maxRaw) || 0));

    let rate = Number(room.extraPersonRate ?? 0);
    if (max > 0) {
      const rateRaw = window.prompt(
        `What does one extra person in ${room.name} cost per night? (${cur()})`,
        String(rate || ""),
      );
      if (rateRaw === null) return;
      rate = Math.max(0, Number(rateRaw) || 0);
      if (rate <= 0) {
        push("An extra person with no price cannot be sold — set a rate, or set the count to 0", "err");
        return;
      }
    }

    try {
      await api(`/rooms/${room.id}`, {
        method: "PATCH",
        body: { extraPersonAllowed: max > 0, extraPersonMax: max, extraPersonRate: rate },
      });
      push(max > 0 ? `${room.name}: ${max} × ${money(rate)}/night` : `${room.name}: no extra person`);
      await load();
    } catch (e) {
      push((e as Error).message, "err");
    }
  }

  /**
   * Removing a room is the one action on this screen that cannot be undone by
   * clicking the same button again, so it says which of the two things will
   * happen — deleted outright, or retired with its history kept — and the
   * owner types nothing they have not been told.
   */
  async function removeRoom(room: Room) {
    const ask =
      `Remove ${room.name} from the inventory?

` +
      `If it has never been sold it is deleted. If it has, it is retired: it leaves the calendar ` +
      `and the room count, and its past bookings, invoices and reports keep it.

This cannot be undone.`;
    if (!window.confirm(ask)) return;
    try {
      const r = await api<{ removed: "deleted" | "retired"; name: string }>(`/rooms/${room.id}`, {
        method: "DELETE",
      });
      push(r.removed === "deleted" ? `${r.name} deleted` : `${r.name} retired — its history is kept`);
      void load();
    } catch (ex) {
      push((ex as Error).message, "err");
    }
  }

  if (error) return <ErrorState error={error} />;
  if (loading) return <Skeleton rows={6} />;

  return (
    <div className="space-y-6">
      <Card
        title="Rooms"
        action={canEdit ? <Button size="sm" variant="ghost" onClick={() => setAddRoom(true)}>+ Add room</Button> : undefined}
        className="!p-0"
      >
        <Table minWidth={640}>
            <thead className="border-b border-slate-100"><tr><Th>Room</Th><Th>Type</Th><Th>Base rate</Th><Th>Extra persons</Th><Th>Status</Th>{canEdit && <Th className="text-right">Actions</Th>}</tr></thead>
            <tbody className="divide-y divide-slate-50">
              {rooms.map((r) => (
                <tr key={r.id}>
                  <Td className="font-medium">{r.name}</Td>
                  <Td className="text-xs">{r.roomType?.name}</Td>
                  <Td>{money(r.baseRate)}</Td>
                  {/* the room's own answer: one type covers rooms of different
                      sizes, which is why this is not on the type any more */}
                  <Td className="text-xs">
                    {r.extraPersonAllowed && (r.extraPersonMax ?? 0) > 0 ? (
                      <span className="text-slate-600">
                        {r.extraPersonMax} × {money(r.extraPersonRate ?? 0)}/night
                      </span>
                    ) : (
                      <span className="text-slate-300">none</span>
                    )}
                  </Td>
                  <Td><Badge value={r.status} /></Td>
                  {canEdit && (
                    <Td className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditRoom(r)}>Edit</Button>{" "}
                      <Button size="sm" variant="ghost" onClick={() => void editExtraPersons(r)}>Extra persons</Button>{" "}
                      <Button size="sm" variant={r.status === "ACTIVE" ? "subtle" : "primary"} onClick={() => toggleRoom(r)}>
                        {r.status === "ACTIVE" ? "Out of service" : "Activate"}
                      </Button>
                      {canDelete && (
                        <>
                          {" "}
                          <Button size="sm" variant="ghost" className="!text-red-600" onClick={() => void removeRoom(r)}>
                            Remove
                          </Button>
                        </>
                      )}
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
      </Card>

      <Card
        title="Room types"
        action={canEdit ? <Button size="sm" variant="ghost" onClick={() => setAddType(true)}>+ Add type</Button> : undefined}
      >
        <div className="flex flex-wrap gap-2">
          {types.map((t) => (
            <button
              key={t.id}
              onClick={() => canEdit && setEditType(t)}
              title={canEdit ? "Click to edit" : undefined}
              className="rounded-lg border border-slate-200 px-3 py-2 text-left transition hover:border-brand-300 hover:bg-brand-50/50"
            >
              <div className="text-sm font-medium">{t.name}</div>
              <div className="text-[11px] text-slate-400">
                {t.maxAdults}A · {t.maxChildren}C
                {t.extraPersonAllowed ? ` · +extra ${money(Number(t.extraPersonRate))}/n` : ""}
                {t.amenities?.length ? ` · ${(t.amenities as string[]).join(", ")}` : ""}
              </div>
            </button>
          ))}
        </div>
        {types.length === 0 && <Empty msg="No room types yet" />}
      </Card>

      <Card
        title="Seasonal rate plans"
        action={canEdit ? <Button size="sm" variant="ghost" onClick={() => setAddPlan(true)}>+ Add plan</Button> : undefined}
      >
        {plans.length === 0 ? (
          <Empty msg="No seasonal rates — base rates apply year-round" />
        ) : (
          <Table minWidth={0}>
            <thead className="border-b border-slate-100"><tr><Th>Type</Th><Th>From</Th><Th>To</Th><Th className="text-right">Price/night</Th></tr></thead>
            <tbody className="divide-y divide-slate-50">
              {plans.map((p) => (
                <tr key={p.id}>
                  <Td className="text-xs">{p.roomType?.name}</Td>
                  <Td className="text-xs">{dmy(p.dateFrom)}</Td>
                  <Td className="text-xs">{dmy(p.dateTo)}</Td>
                  <Td className="text-right font-medium">{money(p.price)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

        <AddRoomTypeModal open={addType} onClose={() => setAddType(false)} onDone={() => void load()} />
        <EditRoomModal room={editRoom} types={types} onClose={() => setEditRoom(null)} onDone={() => void load()} />
        <EditRoomTypeModal t={editType} onClose={() => setEditType(null)} onDone={() => void load()} />
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
        <Field label={`Base rate (${cur()}/night)`}><Input type="number" min={0} value={rate || ""} onChange={(e) => setRate(Number(e.target.value))} /></Field>
        <div className="flex justify-end"><Button onClick={submit} loading={busy} disabled={!name || !typeId || rate <= 0}>Add</Button></div>
      </div>
    </Modal>
  );
}

/**
 * Correcting a room.
 *
 * The only thing this screen could change about a room was its rate, through a
 * `window.prompt` — so a room typed in as "Camelia", or filed under the wrong
 * type, could not be fixed at all. The way out was deleting it and making it
 * again, which takes every booking that points at it with it: the typo cost
 * the history.
 *
 * Changing the type is safe for what is already booked. A booking records its
 * own prices and its own occupancy when it is made; the type is what the next
 * booking will be quoted from.
 */
function EditRoomModal({
  room,
  types,
  onClose,
  onDone,
}: {
  room: Room | null;
  types: RoomType[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { push } = useToast();
  const [name, setName] = useState("");
  const [typeId, setTypeId] = useState<number | "">("");
  const [rate, setRate] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (room) {
      setName(room.name);
      setTypeId(room.roomTypeId);
      setRate(Number(room.baseRate));
    }
  }, [room]);

  async function submit() {
    if (!room) return;
    if (!name.trim()) {
      push("A room needs a name", "err");
      return;
    }
    setBusy(true);
    try {
      await api(`/rooms/${room.id}`, {
        method: "PATCH",
        body: { name: name.trim(), roomTypeId: typeId === "" ? undefined : Number(typeId), baseRate: rate },
      });
      push(`${name.trim()} updated`);
      onDone();
      onClose();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!room} onClose={onClose} title={`Edit room — ${room?.name ?? ""}`}>
      <div className="space-y-3">
        <Field label="Room name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Camellia" />
        </Field>
        <Field label="Room type" hint="what the next booking is quoted from; bookings already made keep their own prices">
          <Select value={typeId} onChange={(e) => setTypeId(e.target.value === "" ? "" : Number(e.target.value))}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
        </Field>
        <Field label={`Base rate (${cur()})`}>
          <Input type="number" min={0} value={rate} onChange={(e) => setRate(Number(e.target.value))} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}

function EditRoomTypeModal({ t, onClose, onDone }: { t: RoomType | null; onClose: () => void; onDone: () => void }) {
  const { push } = useToast();
  const [name, setName] = useState("");
  const [a, setA] = useState(2);
  const [c, setC] = useState(0);
  const [extraAllowed, setExtraAllowed] = useState(false);
  const [extraRate, setExtraRate] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (t) {
      setName(t.name);
      setA(t.maxAdults);
      setC(t.maxChildren);
      setExtraAllowed(!!t.extraPersonAllowed);
      setExtraRate(Number(t.extraPersonRate ?? 0));
    }
  }, [t]);

  async function submit() {
    if (!t) return;
    setBusy(true);
    try {
      await api(`/room-types/${t.id}`, {
        method: "PATCH",
        body: { name, maxAdults: a, maxChildren: c, extraPersonAllowed: extraAllowed, extraPersonRate: extraAllowed ? extraRate : 0 },
      });
      push("Room type updated");
      onDone();
      onClose();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!t} onClose={onClose} title={`Edit room type — ${t?.name ?? ""}`}>
      <div className="space-y-3">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Max adults"><Input type="number" min={1} value={a} onChange={(e) => setA(Number(e.target.value))} /></Field>
          <Field label="Max children"><Input type="number" min={0} value={c} onChange={(e) => setC(Number(e.target.value))} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={extraAllowed} onChange={(e) => setExtraAllowed(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
          Allow extra person (beyond max adults)
        </label>
        {extraAllowed && (
          <Field label={`Extra person rate (${cur()}/night)`}><Input type="number" min={0} value={extraRate || ""} onChange={(e) => setExtraRate(Number(e.target.value))} /></Field>
        )}
        <div className="flex justify-end"><Button onClick={submit} loading={busy} disabled={!name}>Save</Button></div>
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
  const [extraAllowed, setExtraAllowed] = useState(false);
  const [extraRate, setExtraRate] = useState(0);
  const [amen, setAmen] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!activeResort) return;
    setBusy(true);
    try {
      await api(`/resorts/${activeResort.id}/room-types`, {
        method: "POST",
        body: {
          name, maxAdults: a, maxChildren: c,
          extraPersonAllowed: extraAllowed,
          extraPersonRate: extraAllowed ? extraRate : 0,
          amenities: amen ? amen.split(",").map((s) => s.trim()) : undefined,
        },
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
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={extraAllowed} onChange={(e) => setExtraAllowed(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
          Allow extra person (beyond max adults)
        </label>
        {extraAllowed && (
          <Field label={`Extra person rate (${cur()}/night)`}><Input type="number" min={0} value={extraRate || ""} onChange={(e) => setExtraRate(Number(e.target.value))} /></Field>
        )}
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
        <Field label={`Price (${cur()}/night)`}><Input type="number" min={0} value={price || ""} onChange={(e) => setPrice(Number(e.target.value))} /></Field>
        <div className="flex justify-end"><Button onClick={submit} loading={busy} disabled={!typeId || !from || !to || price <= 0}>Add</Button></div>
      </div>
    </Modal>
  );
}
