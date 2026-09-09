"use client";

import { useCallback, useEffect, useState } from "react";
import { api, download, money, type PermRole, cur, API_URL } from "@/lib/api";
import { useApi, useQueryClient } from "@/lib/query";
import { ErrorState } from "@/components/error-state";
import { Tabs } from "@/components/patterns";
import { PERMISSIONS, PERMISSION_GROUPS } from "@rh/shared";
import { useAuth } from "@/lib/auth";
import { Button, Card, Empty, Field, Input, Select, useToast, Th, Td } from "@/components/ui";
import { Users, ScrollText, Percent, KeyRound, Copy, Check, Ban, X, Download } from "lucide-react";

interface ResortDetail {
  id: number;
  name: string;
  location: string | null;
  timezone: string;
  currency: string;
  showRatesToAgents: boolean;
  showGuestNamesToAgents: boolean;
  taxRatePct: string | number;
  invoicePrefix: string;
  bookingPrefix: string;
  fbPrefix: string;
  checkInTime: string;
  checkOutTime: string;
  address: string | null;
  website: string | null;
  contactPhone: string | null;
  fyStartMonthDay: string;
  agentPaymentHours?: number;
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

interface AccessRow {
  id: string;
  user: { id: number; name: string; phone: string; role: string; status: string };
  status: string;
  note: string | null;
  createdAt: string;
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
  commissionKind: string;
  roleId: number | null;
  roleName: string | null;
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
  roomId: number | null;
  room?: { id: number; name: string } | null;
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

const TABS = ["Resort info", "Users & Roles", "Permissions", "Agent access", "Activity log", "Discounts", "Messages", "API keys", "Your data"] as const;

export default function SettingsPage() {
  const { activeResort, isManagement, role } = useAuth();
  const { push } = useToast();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Resort info");
  const [d, setD] = useState<ResortDetail | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [busy, setBusy] = useState(false);
  const rid = activeResort?.id;

  const qc = useQueryClient();
  const infoQ = useApi(["resort", rid], () => api<ResortDetail>(`/resorts/${rid}`), { enabled: !!rid });
  /**
   * The plans the platform actually sells.
   *
   * These buttons read FREE / STANDARD / PRO — names the plan table does not
   * contain — while the platform screen offered STARTER / GROWTH / CHAIN. Two
   * hardcoded vocabularies in one product, neither of them the price list.
   * Only a super admin sees this block, and only they may read the endpoint.
   */
  const plansQ = useApi(
    ["platform-plans"],
    () => api<{ name: string; label: string; active: boolean }[]>("/platform/plans"),
    { enabled: role === "SUPER_ADMIN" },
  );
  const planNames = (plansQ.data ?? []).filter((p) => p.active).map((p) => p.name);

  const usageQ = useApi(["tenant-usage", activeResort?.tenantId], () => api<Usage>(`/tenants/${activeResort!.tenantId}/usage`), {
    enabled: !!activeResort,
  });

  const loadInfo = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["resort", rid] });
    await qc.invalidateQueries({ queryKey: ["tenant-usage", activeResort?.tenantId] });
  }, [qc, rid, activeResort]);

  // the form edits a local copy; the query is the source it starts from
  useEffect(() => {
    if (infoQ.data) setD(infoQ.data);
  }, [infoQ.data]);
  useEffect(() => {
    if (usageQ.data) setUsage(usageQ.data);
  }, [usageQ.data]);

  if (!isManagement) return <Empty msg="Managers & admins only" />;
  if (infoQ.error) return <ErrorState error={infoQ.error} />;
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
          showGuestNamesToAgents: d.showGuestNamesToAgents,
          taxRatePct: Number(d.taxRatePct) || 0,
          invoicePrefix: d.invoicePrefix || undefined,
          bookingPrefix: d.bookingPrefix || undefined,
          fbPrefix: d.fbPrefix || undefined,
          checkInTime: d.checkInTime || undefined,
          checkOutTime: d.checkOutTime || undefined,
          address: d.address ?? undefined,
          website: d.website ?? undefined,
          contactPhone: d.contactPhone ?? undefined,
          fyStartMonthDay: d.fyStartMonthDay || undefined,
          agentPaymentHours: (d as ResortDetail & { agentPaymentHours?: number }).agentPaymentHours ?? undefined,
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

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === "Resort info" && (
        <div className="max-w-xl space-y-4">
          {usage && (
            <Card title={`Plan — ${usage.planLabel}`}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-center">
                <Stat label="Resorts" value={`${usage.resorts}/${usage.limits.maxResorts}`} />
                <Stat label="Rooms" value={String(usage.rooms)} sub={`cap ${usage.limits.maxRoomsPerResort}/resort`} />
                <Stat label="Staff users" value={String(usage.staffUsers)} />
                <Stat label="Guests" value={String(usage.guests)} />
              </div>
              {role === "SUPER_ADMIN" && (
                <div className="mt-3 flex items-center gap-2">
                  {/* these buttons read FREE / STANDARD / PRO — names the plan
                      table does not contain, and a different vocabulary from the
                      STARTER / GROWTH / CHAIN the platform screen offered. The
                      price list is the authority. */}
                  <span className="text-xs text-slate-500">Change plan:</span>
                  {planNames.map((p) => (
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
          {/* 24 / 48 / 72 were three numbers somebody liked. A resort that wants
              its agents paid up 36 hours before arrival can say so. */}
          <Field label="Agent full-payment deadline (hours before check-in)" hint="agent bookings must be fully paid this many hours before check-in">
            <Input
              type="number"
              min={1}
              max={720}
              value={String((d as ResortDetail & { agentPaymentHours?: number }).agentPaymentHours ?? 48)}
              onChange={(e) => setD({ ...d, agentPaymentHours: Math.max(1, Number(e.target.value) || 1) } as ResortDetail)}
            />
          </Field>
              <label className="flex items-center gap-2 pt-1 text-sm text-slate-700">
                <input type="checkbox" checked={d.showRatesToAgents} onChange={(e) => setD({ ...d, showRatesToAgents: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
                Show room rates to agents
              </label>
              <label className="flex items-start gap-2 pt-1 text-sm text-slate-700">
                <input type="checkbox" checked={d.showGuestNamesToAgents} onChange={(e) => setD({ ...d, showGuestNamesToAgents: e.target.checked })} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600" />
                <span>
                  Show guest names to agents
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Off by default. Agents always see which nights are taken and the
                    details of bookings they made themselves; this also gives them the
                    names on everyone else&apos;s — including other agencies&apos; clients.
                  </span>
                </span>
              </label>
              <div className="mt-2 border-t border-slate-100 pt-3 text-xs font-semibold text-slate-500">Invoice & stay settings</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Invoice prefix"><Input value={d.invoicePrefix} onChange={(e) => setD({ ...d, invoicePrefix: e.target.value })} /></Field>
                <Field label="Booking prefix"><Input value={d.bookingPrefix} onChange={(e) => setD({ ...d, bookingPrefix: e.target.value })} /></Field>
                <Field label="Restaurant bill prefix"><Input value={d.fbPrefix} onChange={(e) => setD({ ...d, fbPrefix: e.target.value })} /></Field>
                <Field label="Check-in time"><Input value={d.checkInTime} onChange={(e) => setD({ ...d, checkInTime: e.target.value })} placeholder="12:00 PM" /></Field>
                <Field label="Check-out time"><Input value={d.checkOutTime} onChange={(e) => setD({ ...d, checkOutTime: e.target.value })} placeholder="10:00 AM" /></Field>
              </div>
              <Field label="Address"><Input value={d.address ?? ""} onChange={(e) => setD({ ...d, address: e.target.value })} /></Field>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
      {tab === "Permissions" && rid && <RolesTab rid={rid} />}
      {tab === "Agent access" && rid && <AccessTab rid={rid} />}
      {tab === "Activity log" && rid && <ActivityTab rid={rid} />}
      {tab === "Discounts" && rid && <DiscountsTab rid={rid} />}
      {tab === "API keys" && rid && <ApiKeysTab rid={rid} />}
      {tab === "Messages" && rid && <MessagesTab rid={rid} />}
      {tab === "Your data" && rid && <ExportTab rid={rid} name={d.name} />}
    </div>
  );
}

interface TemplateRow {
  name: string;
  body: string;
  custom: boolean;
  placeholders: string[];
}

const TEMPLATE_LABELS: Record<string, string> = {
  booking_confirmed: "Booking confirmed",
  booking_received: "Booking request received",
  checkin_reminder: "Check-in reminder (the day before)",
  payment_receipt: "Payment received",
};

/**
 * The words your guests read.
 *
 * These went out in wording compiled into the build — a resort could not add
 * their check-in time, write it in Bangla, or soften a reminder for a repeat
 * customer. The message the guest sees is the most visible part of the
 * product, and it was the part the resort had least say over.
 */
function MessagesTab({ rid }: { rid: number }) {
  const { push } = useToast();
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api<TemplateRow[]>(`/resorts/${rid}/message-templates`)
      .then((r) => {
        setRows(r);
        setDrafts(Object.fromEntries(r.map((x) => [x.name, x.body])));
      })
      .catch(() => setRows([]));
  }, [rid]);
  useEffect(() => load(), [load]);

  async function save(name: string) {
    setBusy(name);
    try {
      await api(`/resorts/${rid}/message-templates/${name}`, { method: "PUT", body: { body: drafts[name] ?? "" } });
      push("Saved — new messages will use your wording");
      load();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(null);
    }
  }

  async function reset(name: string) {
    setBusy(name);
    try {
      await api(`/resorts/${rid}/message-templates/${name}`, { method: "DELETE" });
      push("Back to the standard wording");
      load();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-4 max-w-2xl space-y-4">
      <Card>
        <div className="space-y-1 p-4">
          <h2 className="font-semibold text-slate-900">What your guests read</h2>
          <p className="text-sm text-slate-500">
            These go out under your resort&apos;s name. Write them in Bangla, English or both.
            Words in {"{braces}"} are filled in for each guest — the list under each box shows
            what that message can use.
          </p>
        </div>
      </Card>

      {rows.map((r) => (
        <Card key={r.name}>
          <div className="space-y-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-900">{TEMPLATE_LABELS[r.name] ?? r.name}</span>
              {r.custom && <span className="rounded-md bg-brand-50 px-2 py-0.5 text-[11px] text-brand-700">Yours</span>}
            </div>
            <textarea
              value={drafts[r.name] ?? ""}
              onChange={(e) => setDrafts({ ...drafts, [r.name]: e.target.value })}
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-slate-400">
                {r.placeholders.map((p) => `{${p}}`).join(" · ")}
              </span>
              <span className="ml-auto flex gap-2">
                {r.custom && (
                  <Button size="sm" variant="ghost" onClick={() => reset(r.name)} disabled={busy === r.name}>
                    Use standard wording
                  </Button>
                )}
                <Button size="sm" loading={busy === r.name} onClick={() => save(r.name)}>
                  Save
                </Button>
              </span>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

/**
 * Your data, on your terms.
 *
 * This tab exists to be found before it is needed. An owner who can see, on an
 * ordinary Tuesday, that their register downloads in one click is an owner who
 * never has to wonder what happens to it if they stop paying — and the answer
 * to that question decides more sales in this market than any feature list.
 */
const DATASETS: { key: string; label: string; hint: string }[] = [
  { key: "bookings", label: "Bookings", hint: "every stay with its full bill" },
  { key: "guests", label: "Guests", hint: "names, phones, NID/passport" },
  { key: "payments", label: "Payments", hint: "who paid what, when and how" },
  { key: "expenses", label: "Expenses", hint: "resort and restaurant" },
  { key: "restaurant", label: "Restaurant bills", hint: "with line items" },
  { key: "rooms", label: "Rooms & types", hint: "inventory and rates" },
  { key: "staff", label: "Staff & agents", hint: "roles and commissions" },
  { key: "activities", label: "Activities", hint: "the bookable catalogue" },
];

function ExportTab({ rid, name }: { rid: number; name: string }) {
  const { push } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function grab(key: string, label: string) {
    setBusy(key);
    try {
      if (key === "archive") {
        await download(`/resorts/${rid}/export/archive`, `${name}-everything.json`);
      } else {
        await download(`/resorts/${rid}/export/${key}.csv`, `${key}.csv`);
      }
      push(`${label} downloaded`);
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="space-y-1 p-4">
          <h2 className="font-semibold text-slate-900">Your data is yours</h2>
          <p className="text-sm text-slate-500">
            Every file below opens in Excel with Bangla intact. Exports keep working even if the
            subscription lapses — records stay readable and downloadable whatever happens to the account.
          </p>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DATASETS.map((d) => (
          <button
            key={d.key}
            disabled={busy !== null}
            onClick={() => grab(d.key, d.label)}
            className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-brand-300 hover:shadow-sm disabled:opacity-50"
          >
            <Download className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
            <span>
              <span className="block text-sm font-medium text-slate-900">{d.label}</span>
              <span className="block text-xs text-slate-500">{busy === d.key ? "Preparing…" : d.hint}</span>
            </span>
          </button>
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <div className="text-sm font-medium text-slate-900">Everything, in one file</div>
            <div className="text-xs text-slate-500">All eight datasets as a single JSON archive.</div>
          </div>
          <Button onClick={() => grab("archive", "Full archive")} disabled={busy !== null}>
            {busy === "archive" ? "Preparing…" : "Download archive"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function AccessTab({ rid }: { rid: number }) {
  const { push } = useToast();
  const [rows, setRows] = useState<AccessRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [invite, setInvite] = useState({ email: "", name: "", commissionRate: "5", commissionKind: "PERCENT" });
  const [inviting, setInviting] = useState(false);

  const load = useCallback(() => {
    api<AccessRow[]>(`/resorts/${rid}/access-requests`).then(setRows).catch(() => setRows([]));
  }, [rid]);
  useEffect(() => load(), [load]);

  async function decide(id: string, decision: "APPROVE" | "REJECT") {
    setBusy(id);
    try {
      await api(`/access-requests/${id}/decision`, { method: "POST", body: { decision } });
      push(decision === "APPROVE" ? "Agent approved — they can now book" : "Request rejected");
      load();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(null);
    }
  }

  async function sendInvite() {
    setInviting(true);
    try {
      const r = await api<{ emailed: boolean }>(`/resorts/${rid}/invite-agent`, {
        method: "POST",
        body: {
          email: invite.email,
          name: invite.name || undefined,
          commissionRate: Number(invite.commissionRate),
          commissionKind: invite.commissionKind,
        },
      });
      push(r.emailed ? "Invitation email sent — the agent can sign in with the emailed credentials" : "Agent linked — they were notified");
      setInvite({ email: "", name: "", commissionRate: "5", commissionKind: "PERCENT" });
      load();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setInviting(false);
    }
  }

  if (!rows) return <Empty msg="Loading…" />;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Card title={`Agent access requests (${rows.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr><Th>Agent</Th><Th>Phone</Th><Th>Status</Th><Th>Note</Th><Th>Requested</Th><Th /></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <Td>
                    <div className="font-semibold text-slate-800">{r.user.name}</div>
                    <div className="text-xs text-slate-400">{r.user.role.replace(/_/g, " ")} · {r.user.status}</div>
                  </Td>
                  <Td className="text-xs">{r.user.phone}</Td>
                  <Td>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${r.status === "APPROVED" ? "bg-emerald-50 text-emerald-700" : r.status === "PENDING" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>{r.status}</span>
                  </Td>
                  <Td className="text-xs text-slate-500">{r.note ?? "—"}</Td>
                  <Td className="text-xs text-slate-400">{new Date(r.createdAt).toLocaleDateString("en-GB")}</Td>
                  <Td>
                    <div className="flex justify-end gap-1.5">
                      {r.status === "PENDING" && (
                        <>
                          <button onClick={() => decide(r.id, "APPROVE")} disabled={busy === r.id} className="rounded-lg border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">Approve</button>
                          <button onClick={() => decide(r.id, "REJECT")} disabled={busy === r.id} className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">Reject</button>
                        </>
                      )}
                      {r.status === "APPROVED" && <span className="text-xs text-slate-400">has access</span>}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <Empty msg="No requests yet" />}
        </div>
      </Card>

      <Card title="Invite agent by email">
        <div className="space-y-3">
          <Field label="Agent email"><Input type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} placeholder="agent@email.com" /></Field>
          <Field label="Name (optional)"><Input value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} /></Field>
          <Field label="Commission type">
            <Select value={invite.commissionKind} onChange={(e) => setInvite({ ...invite, commissionKind: e.target.value })}>
              <option value="PERCENT">Percent of rent (%)</option>
              <option value="FLAT">Fixed amount ({cur()} per booking)</option>
            </Select>
          </Field>
          <Field label={invite.commissionKind === "FLAT" ? `Commission (${cur()} / booking)` : "Commission (%)"}>
            <Input type="number" min={0} max={invite.commissionKind === "PERCENT" ? 100 : undefined} value={invite.commissionRate} onChange={(e) => setInvite({ ...invite, commissionRate: e.target.value })} />
          </Field>
          <div className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
            The agent receives a <b>verification email</b> with login credentials. New agents start pending — activate them below or in Users.
          </div>
          <Button onClick={sendInvite} loading={inviting} disabled={!invite.email}>Send invitation</Button>
        </div>
      </Card>
    </div>
  );
}

function UsersTab({ rid }: { rid: number }) {
  const { push } = useToast();
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [roles, setRoles] = useState<PermRole[]>([]);
  const [form, setForm] = useState({ name: "", phone: "", password: "", role: "FRONT_DESK", commissionRate: "5", commissionKind: "PERCENT", roleId: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    // the roles list is shared with the Permissions tab and cached under one key
    api<UserRow[]>(`/resorts/${rid}/users`).then(setRows).catch(() => setRows([]));
    api<PermRole[]>(`/resorts/${rid}/roles`).then(setRoles).catch(() => setRoles([]));
  }, [rid]);
  useEffect(() => load(), [load]);

  async function create() {
    setBusy(true);
    try {
      await api(`/resorts/${rid}/users`, {
        method: "POST",
        body: {
          name: form.name, phone: form.phone, password: form.password, role: form.role,
          roleId: form.roleId ? Number(form.roleId) : undefined,
          commissionRate: form.role === "AGENT" ? Number(form.commissionRate) : undefined,
          commissionKind: form.role === "AGENT" ? form.commissionKind : undefined,
        },
      });
      push(`${form.role === "AGENT" ? "Agent" : "Staff"} created${form.role === "AGENT" ? " (pending activation)" : ""}`);
      setForm({ name: "", phone: "", password: "", role: "FRONT_DESK", commissionRate: "5", commissionKind: "PERCENT", roleId: "" });
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
              <tr><Th>Name</Th><Th>Role</Th><Th>Status</Th><Th>Commission</Th><Th>Wallet</Th><Th /></tr>
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
                    <RolePicker u={u} rid={rid} roles={roles} onDone={load} />
                  </Td>
                  <Td>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${u.status === "active" ? "bg-emerald-50 text-emerald-700" : u.status === "pending" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>{u.status}</span>
                  </Td>
                  <Td>
                    {u.role === "AGENT" ? <CommissionEditor u={u} rid={rid} onDone={load} /> : <span className="text-xs text-slate-300">—</span>}
                  </Td>
                  <Td>{u.wallet ? <span className={u.wallet.active ? "text-emerald-700" : "text-slate-400"}>{money(u.wallet.balance)}</span> : <span className="text-xs text-slate-300">no wallet</span>}</Td>
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
                          {/* "Wallet on" sent the same body as Activate beside it
                              and enabled no wallet, so it never went away however
                              many times it was pressed. Removed rather than wired
                              up: nothing in the product turns a wallet on, and a
                              button for a feature that does not exist is worse
                              than no button. */}
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
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value, roleId: "" })}>
              <option value="MANAGER">Manager</option>
              <option value="FRONT_DESK">Front desk</option>
              <option value="AGENT">Agent</option>
              <option value="HOUSEKEEPING">Housekeeping</option>
            </Select>
          </Field>
          <Field label="Permissions set" hint="create custom permission sets in the Permissions tab">
            <Select value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })}>
              <option value="">Default for role</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name} ({r.permissions.length} perms)</option>
              ))}
            </Select>
          </Field>
          {form.role === "AGENT" && (
            <>
              <Field label="Commission type">
                <Select value={form.commissionKind} onChange={(e) => setForm({ ...form, commissionKind: e.target.value })}>
                  <option value="PERCENT">Percent of rent (%)</option>
                  <option value="FLAT">Fixed amount ({cur()} per booking)</option>
                </Select>
              </Field>
              <Field label={form.commissionKind === "FLAT" ? `Commission (${cur()} / booking)` : "Commission (%)"}>
                <Input
                  type="number"
                  min={0}
                  max={form.commissionKind === "PERCENT" ? 100 : undefined}
                  value={form.commissionRate}
                  onChange={(e) => setForm({ ...form, commissionRate: e.target.value })}
                />
              </Field>
            </>
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

function RolePicker({ u, rid, roles, onDone }: { u: UserRow; rid: number; roles: PermRole[]; onDone: () => void }) {
  const { push } = useToast();
  if (roles.length === 0 || u.role === "RESORT_ADMIN") return null;
  return (
    <div className="mt-1 flex items-center gap-1.5">
      <Select
        className="!w-32 !py-0.5 text-xs"
        value={u.roleId ? String(u.roleId) : ""}
        onChange={(e) => {
          const roleId = e.target.value ? Number(e.target.value) : 0;
          api(`/resorts/${rid}/users/${u.id}`, { method: "PATCH", body: { roleId } })
            .then(() => { push("Permissions set updated"); onDone(); })
            .catch((ex) => push((ex as Error).message, "err"));
        }}
      >
        <option value="">Default perms</option>
        {roles.map((r) => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </Select>
      {u.roleName && <span className="text-[10px] text-slate-400">{u.roleName}</span>}
    </div>
  );
}

function RolesTab({ rid }: { rid: number }) {
  const { push } = useToast();
  const { refreshPerms } = useAuth();
  const [roles, setRoles] = useState<PermRole[] | null>(null);
  const [editing, setEditing] = useState<PermRole | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<PermRole[]>(`/resorts/${rid}/roles`).then(setRoles).catch(() => setRoles([]));
  }, [rid]);
  useEffect(() => load(), [load]);

  function openEditor(r: PermRole) {
    setEditing(r);
    setSelected(r.permissions);
  }

  function toggle(key: string) {
    setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));
  }

  async function save() {
    if (!editing) return;
    setBusy(true);
    try {
      await api(`/roles/${editing.id}`, { method: "PATCH", body: { permissions: selected } });
      push(`Permissions saved for ${editing.name}`);
      setEditing(null);
      load();
      refreshPerms();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function createRole() {
    setBusy(true);
    try {
      await api(`/resorts/${rid}/roles`, { method: "POST", body: { name: newName, permissions: [] } });
      push("Role created — now tick its permissions");
      setNewName("");
      load();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function removeRole(r: PermRole) {
    if (!window.confirm(`Delete role "${r.name}"?`)) return;
    try {
      await api(`/roles/${r.id}`, { method: "DELETE" });
      push("Role deleted");
      load();
    } catch (ex) {
      push((ex as Error).message, "err");
    }
  }

  if (!roles) return <Empty msg="Loading…" />;
  const groups = PERMISSION_GROUPS;
  return (
    <div className="space-y-4">
      <Card title="Permission roles">
        <p className="mb-3 text-xs text-slate-500">
          Create a role, then tick exactly what it can do. Assign the set when creating a user (Users &amp; Roles tab). Administrators always have everything.
        </p>
        <div className="flex flex-wrap gap-2">
          {roles.map((r) => (
            <div key={r.id} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
              <span className="text-sm font-semibold text-slate-700">{r.name}</span>
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                {r.permissions.includes("*") ? "all" : r.permissions.length} perms · {r.users} users
              </span>
              <button onClick={() => openEditor(r)} className="text-xs font-semibold text-brand-700 hover:underline">Edit</button>
              {!r.system && (
                <button onClick={() => removeRole(r)} className="text-xs font-semibold text-red-500 hover:underline">Delete</button>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Input className="!w-56" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New role name e.g. Accountant" />
          <Button size="sm" onClick={createRole} loading={busy} disabled={!newName}>Create role</Button>
        </div>
      </Card>

      {editing && (
        <Card title={`Permissions — ${editing.name}`}>
          <div className="space-y-4">
            {groups.map((g) => (
              <div key={g}>
                <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">{g}</div>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {PERMISSIONS.filter((p) => p.group === g).map((p) => (
                    <label key={p.key} className="flex items-center gap-2 rounded-lg border border-slate-100 px-2.5 py-1.5 text-sm hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={selected.includes(p.key)}
                        onChange={() => toggle(p.key)}
                        className="h-4 w-4 rounded border-slate-300 text-brand-600"
                      />
                      <span className="text-slate-700">{p.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <Button onClick={save} loading={busy}>Save permissions</Button>
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function CommissionEditor({ u, rid, onDone }: { u: UserRow; rid: number; onDone: () => void }) {
  const { push } = useToast();
  const [kind, setKind] = useState(u.commissionKind === "FLAT" ? "FLAT" : "PERCENT");
  const [value, setValue] = useState(String(u.commissionRate ?? ""));
  const dirty = kind !== (u.commissionKind ?? "PERCENT") || Number(value) !== Number(u.commissionRate ?? 0);
  return (
    <div className="flex items-center gap-1.5">
      <Select className="!w-24 !py-1" value={kind} onChange={(e) => setKind(e.target.value)}>
        <option value="PERCENT">%</option>
        <option value="FLAT">{cur()} fixed</option>
      </Select>
      <Input className="!w-16 !py-1" type="number" min={0} max={kind === "PERCENT" ? 100 : undefined} value={value} onChange={(e) => setValue(e.target.value)} />
      <button
        onClick={async () => {
          try {
            await api(`/resorts/${rid}/users/${u.id}`, { method: "PATCH", body: { commissionKind: kind, commissionRate: Number(value) } });
            push("Commission saved");
            onDone();
          } catch (ex) {
            push((ex as Error).message, "err");
          }
        }}
        disabled={!dirty}
        className="rounded-lg border border-brand-300 px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-40"
      >
        Save
      </button>
    </div>
  );
}

function ActivityTab({ rid }: { rid: number }) {
  const { push } = useToast();
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      api<ActivityRow[]>(`/resorts/${rid}/activity?take=150${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`)
        .then(setRows)
        .catch(() => setRows([]));
    }, 300);
    return () => clearTimeout(t);
  }, [rid, q]);

  async function remove(id: string) {
    if (!window.confirm("Delete this activity entry?")) return;
    setBusyId(id);
    try {
      await api(`/activity/${id}`, { method: "DELETE" });
      setRows((r) => r?.filter((x) => x.id !== id) ?? null);
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusyId(null);
    }
  }

  if (!rows) return <Empty msg="Loading…" />;
  return (
    <Card title="Who did what (role activity log)">
      <div className="mb-3">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, phone, email or action…" />
      </div>
      <div className="max-h-[70vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead>
            <tr><Th>When</Th><Th>Who</Th><Th>Action</Th><Th>Entity</Th><Th /></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <Td className="whitespace-nowrap text-xs text-slate-400">{new Date(r.createdAt).toLocaleString("en-GB")}</Td>
                <Td>{r.actor ? `${r.actor.name} (${r.actor.role.replace(/_/g, " ")})` : "system"}</Td>
                <Td><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{r.action}</code></Td>
                <Td className="text-xs text-slate-500">{r.entity}{r.entityId ? ` #${r.entityId}` : ""}</Td>
                <Td>
                  <button
                    onClick={() => remove(r.id)}
                    disabled={busyId === r.id}
                    title="Delete activity"
                    className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
                  >
                    <X className="inline h-3.5 w-3.5" /> Delete
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <Empty msg={q ? "No matches" : "No activity recorded yet"} />}
      </div>
    </Card>
  );
}

function DiscountsTab({ rid }: { rid: number }) {
  const { push } = useToast();
  const [rows, setRows] = useState<DiscountRow[] | null>(null);
  const [roomTypes, setRoomTypes] = useState<{ id: number; name: string }[]>([]);
  const [rooms, setRooms] = useState<{ id: number; name: string }[]>([]);
  const [form, setForm] = useState({ scope: "RESORT", roomTypeId: "", roomId: "", name: "", kind: "PERCENT", value: "5", validFrom: "", validTo: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<DiscountRow[]>(`/resorts/${rid}/discounts`).then(setRows).catch(() => setRows([]));
    // the room list is what "one particular room" is chosen from
    api<{ id: number; name: string }[]>(`/resorts/${rid}/rooms`).then(setRooms).catch(() => setRooms([]));
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
          roomTypeId: form.scope === "ROOM_TYPE" ? Number(form.roomTypeId) : undefined,
          roomId: form.scope === "ROOM" ? Number(form.roomId) : undefined,
          name: form.name,
          kind: form.kind,
          value: Number(form.value),
          validFrom: form.validFrom || undefined,
          validTo: form.validTo || undefined,
        },
      });
      push("Discount offer created");
      setForm({ scope: form.scope, roomTypeId: "", roomId: "", name: "", kind: form.kind, value: "5", validFrom: "", validTo: "" });
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
                  <Td className="text-xs">
                    {o.scope === "RESORT"
                      ? "All rooms"
                      : o.scope === "ROOM"
                        ? `Room ${o.room?.name ?? o.roomId}`
                        : (o.roomType?.name ?? `room type ${o.roomTypeId}`)}
                  </Td>
                  <Td className="font-bold text-brand-700">{o.kind === "PERCENT" ? `${Number(o.value)}%` : money(o.value)}</Td>
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
              <option value="ROOM_TYPE">One room type</option>
              <option value="ROOM">One particular room</option>
            </Select>
          </Field>
          {form.scope === "ROOM_TYPE" && (
            <Field label="Room type">
              <Select value={form.roomTypeId} onChange={(e) => setForm({ ...form, roomTypeId: e.target.value })}>
                <option value="">Choose…</option>
                {roomTypes.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </Select>
            </Field>
          )}
          {form.scope === "ROOM" && (
            <Field label="Room" hint="only this room — its identical neighbour keeps its own price">
              <Select value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })}>
                <option value="">Choose…</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Opening offer" /></Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Kind">
              <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                <option value="PERCENT">Percent</option>
                <option value="FLAT">Flat {cur()}</option>
              </Select>
            </Field>
            <Field label={form.kind === "PERCENT" ? "Percent" : `Amount ${cur()}`}>
              <Input type="number" min={0} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            <div><span className="text-emerald-300">curl</span> {API_URL}/v1/availability \</div>
            <div className="pl-4">-H <span className="text-amber-300">&quot;X-Api-Key: rm_live_xxxx.yoursecret&quot;</span></div>
            <div className="mt-2"><span className="text-slate-500"># create booking</span></div>
            <div><span className="text-emerald-300">curl</span> -X POST {API_URL}/v1/bookings \</div>
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
