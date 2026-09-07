"use client";

import { useCallback, useEffect, useState } from "react";
import { api, bdt } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Card, Empty, Field, Input, Select, useToast, Th, Td } from "@/components/ui";
import { Users, ScrollText, Percent, KeyRound, Copy, Check, Ban, X } from "lucide-react";

interface ResortDetail {
  id: number;
  name: string;
  location: string | null;
  timezone: string;
  currency: string;
  showRatesToAgents: boolean;
  taxRatePct: string | number;
  invoicePrefix: string;
  checkInTime: string;
  checkOutTime: string;
  address: string | null;
  website: string | null;
  contactPhone: string | null;
  fyStartMonthDay: string;
  _count?: { bookings: number; guests: number };
}

interface Usage {
  tenantId: number;
  name: string;
  plan: string;
  planLabel: string;
  limits: { maxResorts: number; maxRoomsPerResort: number };
  resorts: number;
  rooms: number;
  staffUsers: number;
  guests: number;
}

interface UserRow {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  role: string;
  status: string;
  createdAt: string;
  wallet: { balance: number; active: boolean } | null;
  commissionRate: number | null;
}

interface ActivityRow {
  id: string;
  actor: { id: number; name: string; role: string } | null;
  action: string;
  entity: string;
  entityId: string | null;
  createdAt: string;
}

interface DiscountRow {
  id: number;
  scope: string;
  roomTypeId: number | null;
  roomType?: { id: number; name: string } | null;
  name: string;
  kind: string;
  value: string;
  validFrom: string | null;
  validTo: string | null;
  active: boolean;
}

interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  active: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

const TABS = ["Resort info", "Users & Roles", "Activity log", "Discounts", "API keys"] as const;

export default function SettingsPage() {
  const { activeResort, isManagement, role } = useAuth();
  const { push } = useToast();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Resort info");
  const [d, setD] = useState<ResortDetail | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [busy, setBusy] = useState(false);
  const rid = activeResort?.id;

  const loadInfo = useCallback(async () => {
    if (!rid) return;
    api<ResortDetail>(`/resorts/${rid}`).then(setD);
    api<Usage>(`/tenants/${activeResort!.tenantId}/usage`).then(setUsage).catch(() => {});
  }, [rid, activeResort]);

  useEffect(() => {
    loadInfo();
  }, [loadInfo]);

  if (!isManagement) return <Empty msg="Managers & admins only" />;
  if (!d) return <Empty msg="Loading…" />;

  async function save() {
    if (!d) return;
    setBusy(true);
    try {
      await api(`/resorts/${d.id}`, {
        method: "PATCH",
        body: {
          name: d.name,
          location: d.location ?? undefined,
          showRatesToAgents: d.showRatesToAgents,
          taxRatePct: Number(d.taxRatePct) || 0,
          invoicePrefix: d.invoicePrefix || undefined,
          checkInTime: d.checkInTime || undefined,
          checkOutTime: d.checkOutTime || undefined,
          address: d.address ?? undefined,
          website: d.website ?? undefined,
          contactPhone: d.contactPhone ?? undefined,
          fyStartMonthDay: d.fyStartMonthDay || undefined,
        },
      });
      push("Settings saved");
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function changePlan(plan: string) {
    if (!usage) return;
    try {
      await api(`/tenants/${usage.tenantId}/plan`, { method: "PATCH", body: { plan } });
      push(`Plan changed to ${plan}`);
      setUsage({ ...usage, plan, planLabel: plan });
    } catch (ex) {
      push((ex as Error).message, "err");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">{d.name} — team, activity, offers & integrations</p>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition ${tab === t ? "bg-white text-brand-700 shadow" : "text-slate-500 hover:text-slate-800"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Resort info" && (
        <div className="max-w-xl space-y-4">
          {usage && (
            <Card title={`Plan — ${usage.planLabel}`}>
              <div className="grid grid-cols-4 gap-3 text-center">
                <Stat label="Resorts" value={`${usage.resorts}/${usage.limits.maxResorts}`} />
                <Stat label="Rooms" value={String(usage.rooms)} sub={`cap ${usage.limits.maxRoomsPerResort}/resort`} />
                <Stat label="Staff users" value={String(usage.staffUsers)} />
                <Stat label="Guests" value={String(usage.guests)} />
              </div>
              {role === "SUPER_ADMIN" && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-slate-500">Change plan:</span>
                  {["FREE", "STANDARD", "PRO"].map((p) => (
                    <Button key={p} size="sm" variant={usage.plan === p ? "primary" : "ghost"} onClick={() => changePlan(p)}>
                      {p}
                    </Button>
                  ))}
                </div>
              )}
            </Card>
          )}

          <Card title="Resort settings">
            <div className="space-y-3">
              <Field label="Resort name"><Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
              <Field label="Location"><Input value={d.location ?? ""} onChange={(e) => setD({ ...d, location: e.target.value })} /></Field>
              <Field label="Tax rate (%)"><Input type="number" min={0} max={100} value={String(d.taxRatePct)} onChange={(e) => setD({ ...d, taxRatePct: e.target.value })} /></Field>
              <label className="flex items-center gap-2 pt-1 text-sm text-slate-700">
                <input type="checkbox" checked={d.showRatesToAgents} onChange={(e) => setD({ ...d, showRatesToAgents: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
                Show room rates to agents
              </label>
              <div className="mt-2 border-t border-slate-100 pt-3 text-xs font-semibold text-slate-500">Invoice & stay settings</div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Invoice prefix"><Input value={d.invoicePrefix} onChange={(e) => setD({ ...d, invoicePrefix: e.target.value })} /></Field>
                <Field label="Check-in time"><Input value={d.checkInTime} onChange={(e) => setD({ ...d, checkInTime: e.target.value })} placeholder="12:00 PM" /></Field>
                <Field label="Check-out time"><Input value={d.checkOutTime} onChange={(e) => setD({ ...d, checkOutTime: e.target.value })} placeholder="10:00 AM" /></Field>
              </div>
              <Field label="Address"><Input value={d.address ?? ""} onChange={(e) => setD({ ...d, address: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Website"><Input value={d.website ?? ""} onChange={(e) => setD({ ...d, website: e.target.value })} /></Field>
                <Field label="Contact phone"><Input value={d.contactPhone ?? ""} onChange={(e) => setD({ ...d, contactPhone: e.target.value })} /></Field>
              </div>
              <div className="pt-2"><Button onClick={save} loading={busy}>Save changes</Button></div>
            </div>
          </Card>

          {d._count && (
            <Card title="At a glance">
              <div className="flex gap-6 text-sm text-slate-600">
                <div><b className="text-slate-900">{d._count.bookings}</b> bookings</div>
                <div><b className="text-slate-900">{d._count.guests}</b> guests</div>
              </div>
            </Card>
          )}
        </div>
      )}

      {tab === "Users & Roles" && rid && <UsersTab rid={rid} />}
      {tab === "Activity log" && rid && <ActivityTab rid={rid} />}
      {tab === "Discounts" && rid && <DiscountsTab rid={rid} />}
      {tab === "API keys" && rid && <ApiKeysTab rid={rid} />}
    </div>
  );
}

function UsersTab({ rid }: { rid: number }) {
  const { push } = useToast();
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", password: "", role: "FRONT_DESK", commissionRate: "5" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<UserRow[]>(`/resorts/${rid}/users`).then(setRows).catch(() => setRows([]));
  }, [rid]);
  useEffect(() => load(), [load]);

  async function create() {
    setBusy(true);
    try {
      await api(`/resorts/${rid}/users`, {
        method: "POST",
        body: { name: form.name, phone: form.phone, password: form.password, role: form.role, commissionRate: form.role === "AGENT" ? Number(form.commissionRate) : undefined },
      });
      push(`${form.role === "AGENT" ? "Agent" : "Staff"} created${form.role === "AGENT" ? " (pending activation)" : ""}`);
      setForm({ name: "", phone: "", password: "", role: "FRONT_DESK", commissionRate: "5" });
      load();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function patch(userId: number, body: Record<string, unknown>) {
    try {
      await api(`/resorts/${rid}/users/${userId}`, { method: "PATCH", body });
      load();
      push("Updated");
    } catch (ex) {
      push((ex as Error).message, "err");
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Card title={`Team (${rows?.length ?? 0})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr><Th>Name</Th><Th>Role</Th><Th>Status</Th><Th>Wallet</Th><Th /></tr>
            </thead>
            <tbody>
              {(rows ?? []).map((u) => (
                <tr key={u.id} className="border-t border-slate-100">
                  <Td>
                    <div className="font-semibold text-slate-800">{u.name}</div>
                    <div className="text-xs text-slate-400">{u.phone}</div>
                  </Td>
                  <Td>
                    <Select className="!w-36 !py-1" value={u.role} onChange={(e) => patch(u.id, { role: e.target.value })}>
                      {["RESORT_ADMIN", "MANAGER", "FRONT_DESK", "AGENT", "HOUSEKEEPING"].map((r) => (
                        <option key={r} value={r}>{r.replace(/_/g, " ")}</option>
                      ))}
                    </Select>
                  </Td>
                  <Td>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${u.status === "active" ? "bg-emerald-50 text-emerald-700" : u.status === "pending" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>{u.status}</span>
                  </Td>
                  <Td>{u.wallet ? <span className={u.wallet.active ? "text-emerald-700" : "text-slate-400"}>{bdt(u.wallet.balance)}</span> : <span className="text-xs text-slate-300">no wallet</span>}</Td>
                  <Td>
                    <div className="flex justify-end gap-1.5">
                      {u.status !== "active" && (
                        <button onClick={() => patch(u.id, { status: "active" })} className="rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
                          <Check className="inline h-3.5 w-3.5" /> Activate
                        </button>
                      )}
                      {u.status === "active" && u.role === "AGENT" && (
                        <>
                          <button onClick={() => patch(u.id, { status: "suspended" })} className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">
                            <Ban className="inline h-3.5 w-3.5" /> Suspend
                          </button>
                          {!u.wallet?.active && (
                            <button onClick={() => patch(u.id, { status: "active" })} className="rounded-lg border border-brand-200 px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50">
                              Wallet on
                            </button>
                          )}
                        </>
                      )}
                      {u.status === "active" && u.role !== "AGENT" && (
                        <button onClick={() => patch(u.id, { status: "suspended" })} className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">
                          <Ban className="inline h-3.5 w-3.5" /> Suspend
                        </button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows?.length === 0 && <Empty msg="No team members yet" />}
        </div>
      </Card>

      <Card title="Add team member">
        <div className="space-y-3">
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Phone (login)"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="8801XXXXXXXXX" /></Field>
          <Field label="Password"><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          <Field label="Role">
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="MANAGER">Manager</option>
              <option value="FRONT_DESK">Front desk</option>
              <option value="AGENT">Agent</option>
              <option value="HOUSEKEEPING">Housekeeping</option>
            </Select>
          </Field>
          {form.role === "AGENT" && (
            <Field label="Commission (%)">
              <Input type="number" min={0} max={100} value={form.commissionRate} onChange={(e) => setForm({ ...form, commissionRate: e.target.value })} />
            </Field>
          )}
          {form.role === "AGENT" && (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Agents start as <b>pending</b> — activate them after review. Suspended agents can't create bookings.
            </div>
          )}
          <Button onClick={create} loading={busy} disabled={!form.name || !form.phone || !form.password}>Create account</Button>
        </div>
      </Card>
    </div>
  );
}

function ActivityTab({ rid }: { rid: number }) {
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  useEffect(() => {
    api<ActivityRow[]>(`/resorts/${rid}/activity?take=150`).then(setRows).catch(() => setRows([]));
  }, [rid]);
  if (!rows) return <Empty msg="Loading…" />;
  return (
    <Card title="Who did what (role activity log)">
      <div className="max-h-[70vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead>
            <tr><Th>When</Th><Th>Who</Th><Th>Action</Th><Th>Entity</Th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <Td className="whitespace-nowrap text-xs text-slate-400">{new Date(r.createdAt).toLocaleString("en-GB")}</Td>
                <Td>{r.actor ? `${r.actor.name} (${r.actor.role.replace(/_/g, " ")})` : "system"}</Td>
                <Td><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{r.action}</code></Td>
                <Td className="text-xs text-slate-500">{r.entity}{r.entityId ? ` #${r.entityId}` : ""}</Td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <Empty msg="No activity recorded yet" />}
      </div>
    </Card>
  );
}

function DiscountsTab({ rid }: { rid: number }) {
  const { push } = useToast();
  const [rows, setRows] = useState<DiscountRow[] | null>(null);
  const [roomTypes, setRoomTypes] = useState<{ id: number; name: string }[]>([]);
  const [form, setForm] = useState({ scope: "RESORT", roomTypeId: "", name: "", kind: "PERCENT", value: "5", validFrom: "", validTo: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<DiscountRow[]>(`/resorts/${rid}/discounts`).then(setRows).catch(() => setRows([]));
    api<{ id: number; name: string }[]>(`/resorts/${rid}/rooms`, { method: "GET" }).catch(() => {});
  }, [rid]);
  useEffect(() => {
    load();
    api<{ roomTypes?: { id: number; name: string }[] }>(`/resorts/${rid}`).then((r) => setRoomTypes(r.roomTypes ?? [])).catch(() => {});
  }, [load, rid]);

  async function create() {
    setBusy(true);
    try {
      await api(`/resorts/${rid}/discounts`, {
        method: "POST",
        body: {
          scope: form.scope,
          roomTypeId: form.scope === "ROOM" ? Number(form.roomTypeId) : undefined,
          name: form.name,
          kind: form.kind,
          value: Number(form.value),
          validFrom: form.validFrom || undefined,
          validTo: form.validTo || undefined,
        },
      });
      push("Discount offer created");
      setForm({ scope: form.scope, roomTypeId: "", name: "", kind: form.kind, value: "5", validFrom: "", validTo: "" });
      load();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(id: number, active: boolean) {
    try {
      await api(`/discounts/${id}`, { method: "PATCH", body: { active } });
      load();
    } catch (ex) {
      push((ex as Error).message, "err");
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Card title="Discount offers (auto-applied at booking)">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr><Th>Name</Th><Th>Applies to</Th><Th>Discount</Th><Th>Valid</Th><Th>Status</Th><Th /></tr>
            </thead>
            <tbody>
              {(rows ?? []).map((o) => (
                <tr key={o.id} className="border-t border-slate-100">
                  <Td className="font-semibold text-slate-800">{o.name}</Td>
                  <Td className="text-xs">{o.scope === "RESORT" ? "All rooms" : (o.roomType?.name ?? `room type ${o.roomTypeId}`)}</Td>
                  <Td className="font-bold text-brand-700">{o.kind === "PERCENT" ? `${Number(o.value)}%` : bdt(o.value)}</Td>
                  <Td className="text-xs text-slate-500">{o.validFrom ? new Date(o.validFrom).toLocaleDateString("en-GB") : "always"} → {o.validTo ? new Date(o.validTo).toLocaleDateString("en-GB") : "always"}</Td>
                  <Td>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${o.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{o.active ? "active" : "off"}</span>
                  </Td>
                  <Td>
                    <button onClick={() => toggle(o.id, !o.active)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                      {o.active ? "Turn off" : "Turn on"}
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows?.length === 0 && <Empty msg="No offers — bookings get no automatic discount" />}
        </div>
      </Card>

      <Card title="New offer">
        <div className="space-y-3">
          <Field label="Applies to">
            <Select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
              <option value="RESORT">Whole resort (all rooms)</option>
              <option value="ROOM">One room type</option>
            </Select>
          </Field>
          {form.scope === "ROOM" && (
            <Field label="Room type">
              <Select value={form.roomTypeId} onChange={(e) => setForm({ ...form, roomTypeId: e.target.value })}>
                <option value="">Choose…</option>
                {roomTypes.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Opening offer" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kind">
              <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                <option value="PERCENT">Percent</option>
                <option value="FLAT">Flat ৳</option>
              </Select>
            </Field>
            <Field label={form.kind === "PERCENT" ? "Percent" : "Amount ৳"}>
              <Input type="number" min={0} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From"><Input type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} /></Field>
            <Field label="Until"><Input type="date" value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} /></Field>
          </div>
          <div className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
            New bookings without a manual discount automatically get the <b>best active offer</b>.
          </div>
          <Button onClick={create} loading={busy} disabled={!form.name}>Create offer</Button>
        </div>
      </Card>
    </div>
  );
}

function ApiKeysTab({ rid }: { rid: number }) {
  const { push } = useToast();
  const [rows, setRows] = useState<ApiKeyRow[] | null>(null);
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<ApiKeyRow[]>(`/resorts/${rid}/api-keys`).then(setRows).catch(() => setRows([]));
  }, [rid]);
  useEffect(() => load(), [load]);

  async function create() {
    setBusy(true);
    try {
      const r = await api<{ key: string }>(`/resorts/${rid}/api-keys`, { method: "POST", body: { name } });
      setNewKey(r.key);
      setName("");
      load();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    try {
      await api(`/api-keys/${id}`, { method: "DELETE" });
      load();
      push("Key revoked");
    } catch (ex) {
      push((ex as Error).message, "err");
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        {newKey && (
          <Card title="Your new API key — copy it now, shown only once">
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-lg bg-slate-900 px-3 py-2.5 text-xs text-emerald-300">{newKey}</code>
              <Button
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(newKey);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copy
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setNewKey(null)}><X className="h-4 w-4" /></Button>
            </div>
          </Card>
        )}
        <Card title={`API keys (${rows?.length ?? 0})`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr><Th>Name</Th><Th>Prefix</Th><Th>Status</Th><Th>Last used</Th><Th /></tr>
              </thead>
              <tbody>
                {(rows ?? []).map((k) => (
                  <tr key={k.id} className="border-t border-slate-100">
                    <Td className="font-semibold text-slate-800">{k.name}</Td>
                    <Td><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{k.prefix}…</code></Td>
                    <Td>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${k.active ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{k.active ? "active" : "revoked"}</span>
                    </Td>
                    <Td className="text-xs text-slate-400">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString("en-GB") : "never"}</Td>
                    <Td>
                      {k.active && (
                        <button onClick={() => revoke(k.id)} className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">Revoke</button>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows?.length === 0 && <Empty msg="No keys yet" />}
          </div>
        </Card>
        <Card title="Use it on your website">
          <div className="overflow-x-auto rounded-lg bg-slate-900 p-4 font-mono text-[11px] leading-relaxed text-slate-300">
            <div><span className="text-slate-500"># availability</span></div>
            <div><span className="text-emerald-300">curl</span> https://backresort.rootcodebd.com/v1/availability \</div>
            <div className="pl-4">-H <span className="text-amber-300">&quot;X-Api-Key: rm_live_xxxx.yoursecret&quot;</span></div>
            <div className="mt-2"><span className="text-slate-500"># create booking</span></div>
            <div><span className="text-emerald-300">curl</span> -X POST https://backresort.rootcodebd.com/v1/bookings \</div>
            <div className="pl-4">-H <span className="text-amber-300">&quot;X-Api-Key: …&quot;</span> -H <span className="text-amber-300">&quot;Content-Type: application/json&quot;</span> \</div>
            <div className="pl-4">-d <span className="text-amber-300">&apos;{"{"}&quot;roomIds&quot;:[1],&quot;checkIn&quot;:&quot;2026-10-01&quot;,&quot;checkOut&quot;:&quot;2026-10-03&quot;,&quot;adults&quot;:2,&quot;guestName&quot;:&quot;John&quot;{"}"}&apos;</span></div>
          </div>
        </Card>
      </div>

      <Card title="New API key">
        <div className="space-y-3">
          <Field label="Key name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My resort website" /></Field>
          <div className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
            Point your existing website at the availability & booking endpoints — bookings land straight in your console calendar.
          </div>
          <Button onClick={create} loading={busy} disabled={!name}>Generate key</Button>
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2">
      <div className="text-[10px] font-medium text-slate-400">{label}</div>
      <div className="text-sm font-bold text-slate-800">{value}</div>
      {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
    </div>
  );
}
