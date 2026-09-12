"use client";

import { useCallback, useEffect, useState } from "react";
import { api, download, money, type PermRole, cur, API_URL } from "@/lib/api";
import { useApi, useQueryClient } from "@/lib/query";
import { ErrorState } from "@/components/error-state";
import { Tabs } from "@/components/patterns";
import { PERMISSIONS, PERMISSION_GROUPS } from "@rh/shared";
import { useAuth } from "@/lib/auth";
import { Button, Card, Empty, Field, Input, Select, Spinner, useToast, Th, Td } from "@/components/ui";
import { Users, ScrollText, Percent, KeyRound, Copy, Check, Ban, X, Download } from "lucide-react";
import { useLoadFailure, LoadFailed } from "@/lib/load-state";
import { changedContactFields, displayEmail, displayPhone, emailError, isPlaceholderEmail, isPlaceholderPhone, phoneError } from "@/lib/contact";

interface ResortDetail {
  id: number;
  name: string;
  location: string | null;
  timezone: string;
  currency: string;
  showRatesToAgents: boolean;
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

interface PlanOption {
  name: string;
  label: string;
  monthlyFee: number;
  yearlyFee: number | null;
  yearlySaving: { pct: number; monthsFree: number; amount: number } | null;
  maxRooms: number;
  maxResorts: number;
  blurb: string | null;
  direction: "current" | "upgrade" | "downgrade" | "available";
}

interface SubscriptionDetail {
  plan: string | null;
  planLabel: string | null;
  blurb: string | null;
  status: string;
  /** MONTHLY | YEARLY — what one period is, and what `fee` covers. */
  billingCycle: "MONTHLY" | "YEARLY";
  fee: number;
  feePerMonth: number;
  startedAt: string | null;
  trialEndsAt: string | null;
  renewsAt: string | null;
  pendingPlan: string | null;
  pendingPlanLabel: string | null;
  pendingCycle: "MONTHLY" | "YEARLY" | null;
  limits: { maxRooms: number; maxResorts: number; label: string };
  usage: { rooms: number; resorts: number };
  outstanding: { amount: number; count: number };
  bills: {
    id: string; amount: number; periodStart: string; periodEnd: string;
    dueDate: string; status: string; paidAt: string | null; note: string | null;
  }[];
  plans: PlanOption[];
}

interface PlanChange {
  plan: string;
  planLabel: string;
  effective: "now" | "renewal" | "cancelled";
  effectiveFrom: string | null;
  charged: number;
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

// "API keys" is not on this list while nothing consumes a key: the resort-website
// API went with the guest surface (2026-09-11 design, §4.3). The tab's code stays
// so it can come back with the feature; a screen that mints a key opening nothing
// is a lie told to a customer.
const TABS = ["Resort info", "Subscription", "Users & Roles", "Permissions", "Agent access", "Lists", "Activity log", "Discounts", "Messages", "Your data"] as const;

export default function SettingsPage() {
  const { activeResort, isManagement, can } = useAuth();
  const { push } = useToast();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Resort info");
  const [d, setD] = useState<ResortDetail | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [busy, setBusy] = useState(false);
  const rid = activeResort?.id;
  /* the API refuses without `billing.view`; a tab that always errors is worse
     than no tab, so it is not offered either */
  const visibleTabs = TABS.filter((t) => t !== "Subscription" || can("billing.view"));

  const qc = useQueryClient();
  const infoQ = useApi(["resort", rid], () => api<ResortDetail>(`/resorts/${rid}`), { enabled: !!rid });
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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">{d.name} — team, activity, offers & integrations</p>
      </div>

      <Tabs tabs={visibleTabs} value={tab} onChange={setTab} />

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
              {/*
                A "Change plan" row used to sit here. It wrote `Tenant.plan` —
                a field the billing sweep never reads — so the fee, the renewal
                date and the status stayed exactly as they were: it changed a
                label. The subscription the platform actually bills is on the
                Subscription tab, and a super admin assigns one in Platform →
                Resorts.
              */}
              <p className="mt-3 text-xs text-slate-400">
                Plan, price and renewal date live on the <b>Subscription</b> tab.
              </p>
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
              <p className="pt-1 text-xs text-slate-500">
                Agents see which nights are taken, and the full details of the bookings
                they made themselves. Everyone else&apos;s stays show as occupied and
                nothing more — a name on that calendar would be your other agents&apos;
                client list.
              </p>
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

      {tab === "Subscription" && rid && can("billing.view") && <SubscriptionTab rid={rid} />}
      {tab === "Users & Roles" && rid && <UsersTab rid={rid} />}
      {tab === "Permissions" && rid && <RolesTab rid={rid} />}
      {tab === "Agent access" && rid && <AccessTab rid={rid} />}
      {tab === "Lists" && rid && <ListsTab rid={rid} />}
      {tab === "Activity log" && rid && <ActivityTab rid={rid} />}
      {tab === "Discounts" && rid && <DiscountsTab rid={rid} />}
      {/* tab can never actually be "API keys" now it is off TABS — the cast
          keeps this branch (and ApiKeysTab) compiling as dead code, not deleted */}
      {(tab as string) === "API keys" && rid && <ApiKeysTab rid={rid} />}
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
interface OptionRow {
  id: number;
  code: string;
  label: string;
  active: boolean;
}

/**
 * The lists a resort owns.
 *
 * `options.service.ts`, its lists and its migration all shipped without a
 * screen, so the registry's promise — "editable, extendable, no migration and
 * no deploy" — was true of the API and false of the product. Nobody could
 * change a payment method or a booking source from the console, and expense
 * categories were not a list at all: they were a `groupBy` over whatever had
 * been typed into past expenses, so "Salaries", "salary" and "Salery" were
 * three categories for ever, and three rows in every report.
 */
function ListsTab({ rid }: { rid: number }) {
  const [list, setList] = useState<string>("EXPENSE_CATEGORY");
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const qc = useQueryClient();
  const { push } = useToast();

  const listsQ = useApi(["option-lists"], () => api<{ name: string; label: string }[]>("/option-lists"), {
    staleTime: 3_600_000,
  });
  const rowsQ = useApi(["options", rid, list], () => api<OptionRow[]>(`/resorts/${rid}/options/${list}`));

  async function act(work: () => Promise<unknown>) {
    setBusy(true);
    setErr("");
    try {
      await work();
      await qc.invalidateQueries({ queryKey: ["options", rid, list] });
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  }

  const tidy = (v: string) => v.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");

  const add = () =>
    act(async () => {
      await api(`/resorts/${rid}/options/${list}`, {
        method: "POST",
        body: { code: tidy(code), label: label.trim() },
      });
      push(`${label.trim()} added`);
      setCode("");
      setLabel("");
    });

  const rows = rowsQ.data ?? null;

  return (
    <div className="mt-5 space-y-4">
      <Card title="Which list">
        <div className="flex flex-wrap gap-2">
          {(listsQ.data ?? []).map((l) => (
            <button
              key={l.name}
              onClick={() => setList(l.name)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                list === l.name ? "bg-brand-600 text-white" : "border border-slate-300 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          These are yours to change. Renaming one leaves everything already filed under it where it
          is; hiding one keeps the history and stops it being offered again.
        </p>
      </Card>

      {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">{err}</div>}

      <Card title="Add to this list">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Name people will see">
            <Input
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                if (!code.trim()) setCode(e.target.value);
              }}
              placeholder="Boat fuel"
            />
          </Field>
          <Field label="Code — fixed once saved">
            <Input value={tidy(code)} onChange={(e) => setCode(e.target.value)} placeholder="BOAT_FUEL" className="font-mono" />
          </Field>
          <Button onClick={add} loading={busy} disabled={!label.trim() || !code.trim()}>Add</Button>
        </div>
      </Card>

      <Card title="On this list">
        {rows === null ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <Empty msg="Nothing on this list yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Code</Th>
                  <Th>Shown</Th>
                  <Th> </Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id} className="border-t border-slate-100">
                    <Td>
                      <input
                        defaultValue={o.label}
                        onBlur={(e) => {
                          const next = e.target.value.trim();
                          if (next && next !== o.label) {
                            void act(() => api(`/resorts/${rid}/options/${list}/${o.id}`, { method: "PATCH", body: { label: next } }));
                          }
                        }}
                        className="w-full rounded-lg border border-transparent px-2 py-1 hover:border-slate-300 focus:border-brand-400 focus:outline-none"
                      />
                    </Td>
                    <Td className="font-mono text-xs text-slate-400">{o.code}</Td>
                    <Td>
                      <button
                        onClick={() => void act(() => api(`/resorts/${rid}/options/${list}/${o.id}`, { method: "PATCH", body: { active: !o.active } }))}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${o.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}
                      >
                        {o.active ? "shown" : "hidden"}
                      </button>
                    </Td>
                    <Td>
                      <button
                        onClick={() => {
                          if (window.confirm(`Remove "${o.label}"? Anything already filed under it keeps the code.`)) {
                            void act(() => api(`/resorts/${rid}/options/${list}/${o.id}`, { method: "DELETE" }));
                          }
                        }}
                        className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

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

interface AgencyTermsRow {
  accountId: number;
  name: string;
  status: string;
  blocked: boolean;
  commissionKind: string | null;
  commissionRate: number | null;
}

/**
 * Agents: the open door (2026-09-11 design, §8).
 *
 * This was a queue of access requests — one Approve per agency per resort, by
 * someone who cannot vet a travel agency by reading its name. The platform
 * verifies agencies now. What is left here is the resort's own commercial
 * decisions: is it open to agents, which agency does it refuse, and did it
 * strike a different commission with one of them.
 */
function AccessTab({ rid }: { rid: number }) {
  const { push } = useToast();
  // a failed load must not read as "no agencies"
  const fail = useLoadFailure();
  const [open, setOpen] = useState<boolean | null>(null);
  const [rows, setRows] = useState<AgencyTermsRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [deal, setDeal] = useState<Record<number, string>>({});
  const [invite, setInvite] = useState({ email: "", name: "" });
  const [inviting, setInviting] = useState(false);

  const load = useCallback(() => {
    api<{ agentsOpen?: boolean }>(`/resorts/${rid}`).then((r) => setOpen(!!r.agentsOpen)).catch(() => setOpen(null));
    api<AgencyTermsRow[]>(`/resorts/${rid}/agencies`).then((r) => { setRows(r); fail.clear(); }).catch(fail.onFail(() => setRows([])));
  }, [rid]);
  useEffect(() => load(), [load]);

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    try {
      await fn();
      push(ok);
      load();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(null);
    }
  }
  const toggleDoor = () =>
    run(
      "door",
      () => api(`/resorts/${rid}/agents-open`, { method: "POST", body: { open: !open } }),
      open ? "Closed to agencies — they stop selling on their next click" : "Open to agencies — every verified agency can now sell your rooms",
    );
  const toggleBlock = (a: AgencyTermsRow) =>
    run(
      `b${a.accountId}`,
      () => api(`/resorts/${rid}/agencies/${a.accountId}`, { method: "PATCH", body: { blocked: !a.blocked } }),
      a.blocked ? `${a.name} can sell your rooms again` : `${a.name} is blocked from selling your rooms`,
    );
  const saveDeal = (a: AgencyTermsRow) => {
    const v = (deal[a.accountId] ?? "").trim();
    return run(
      `d${a.accountId}`,
      () => api(`/resorts/${rid}/agencies/${a.accountId}`, { method: "PATCH", body: { commissionKind: "PERCENT", commissionRate: v === "" ? null : Number(v) } }),
      v === "" ? `${a.name} is back on your standard rate` : `${a.name} now earns ${v}% with you`,
    );
  };

  async function sendInvite() {
    setInviting(true);
    try {
      const r = await api<{ emailed: boolean }>(`/resorts/${rid}/invite-agency`, {
        method: "POST",
        body: { email: invite.email, name: invite.name || undefined },
      });
      push(r.emailed ? "Invitation sent — the agency signs itself up from the link" : "Agency told — it is already on the platform");
      setInvite({ email: "", name: "" });
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
      <div className="space-y-4">
        <Card title="Open to travel agencies?">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-lg text-sm text-slate-600">
              {open
                ? "Open: every agency the platform has verified can find your resort and book for its clients, on your commission. Block any agency below — it takes effect on its next click."
                : "Closed: no agency can sell your rooms. Open it to let every verified agency book for its clients; you can still block any one of them."}
            </p>
            <Button onClick={toggleDoor} loading={busy === "door"} disabled={open === null} variant={open ? "ghost" : undefined}>
              {open ? "Close to agencies" : "Open to agencies"}
            </Button>
          </div>
        </Card>

        <Card title={`Verified agencies (${rows.length})`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr><Th>Agency</Th><Th>Selling here</Th><Th>Commission</Th><Th /></tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.accountId} className="border-t border-slate-100">
                    <Td>
                      <div className="font-semibold text-slate-800">{a.name}</div>
                      {a.status !== "active" && <div className="text-xs text-slate-400">{a.status}</div>}
                    </Td>
                    <Td>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${a.blocked ? "bg-red-50 text-red-700" : open ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {a.blocked ? "blocked" : open ? "yes" : "resort closed"}
                      </span>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <Input
                          className="!w-20 !py-1"
                          inputMode="decimal"
                          placeholder={a.commissionRate != null ? String(a.commissionRate) : "standard"}
                          value={deal[a.accountId] ?? ""}
                          onChange={(e) => setDeal({ ...deal, [a.accountId]: e.target.value })}
                        />
                        <span className="text-xs text-slate-400">%</span>
                        <button
                          onClick={() => void saveDeal(a)}
                          disabled={busy === `d${a.accountId}`}
                          className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Save
                        </button>
                      </div>
                      {a.commissionRate != null && (
                        <div className="mt-0.5 text-[11px] text-slate-400">
                          {a.commissionKind === "FLAT" ? `flat ${a.commissionRate}` : `${a.commissionRate}%`} — its own deal; save empty for your standard rate
                        </div>
                      )}
                    </Td>
                    <Td>
                      <div className="flex justify-end">
                        <button
                          onClick={() => void toggleBlock(a)}
                          disabled={busy === `b${a.accountId}`}
                          className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${a.blocked ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50" : "border-red-200 text-red-600 hover:bg-red-50"}`}
                        >
                          {a.blocked ? "Unblock" : "Block"}
                        </button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
            <LoadFailed error={fail.error} onRetry={load} />
            {!fail.error && rows.length === 0 && <Empty msg="No agency has been verified on the platform yet" />}
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <CommissionCard rid={rid} />

      <Card title="Invite an agency by email">
        <div className="space-y-3">
          <Field label="Agency email"><Input type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} placeholder="agency@email.com" /></Field>
          <Field label="Agency name (optional)"><Input value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} /></Field>

          <div className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
            The agency receives a <b>link to sign up</b> — it sets its own sign-in, and nobody is sent a password. Once the platform verifies it, it can sell for you. An agency already on the platform is simply told.
          </div>
          <Button onClick={sendInvite} loading={inviting} disabled={!!emailError(invite.email)}>
            Send invitation
          </Button>
        </div>
      </Card>
      </div>
    </div>
  );
}

/**
 * What the resort pays its agents — one rate, for all of them.
 *
 * Commission used to be a field on every agent's row, editable per person, so
 * two agents selling the same room could earn different money on it and no
 * screen showed the spread. It is the resort's term now, and this is the only
 * place it is set.
 */
function CommissionCard({ rid }: { rid: number }) {
  const { push } = useToast();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [kind, setKind] = useState("PERCENT");
  const [rate, setRate] = useState("");
  const [busy, setBusy] = useState(false);
  const editable = can("agents.manage");

  const q = useApi(["commission", rid], () => api<{ kind: string; rate: number }>(`/resorts/${rid}/commission`), {
    enabled: !!rid,
  });
  useEffect(() => {
    if (q.data) {
      setKind(q.data.kind);
      setRate(String(q.data.rate));
    }
  }, [q.data]);

  const dirty = !!q.data && (kind !== q.data.kind || Number(rate) !== q.data.rate);

  async function save() {
    setBusy(true);
    try {
      await api(`/resorts/${rid}/commission`, { method: "POST", body: { kind, rate: Number(rate) } });
      push("Commission saved — it applies to every agent");
      await qc.invalidateQueries({ queryKey: ["commission", rid] });
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Agent commission">
      {q.error ? (
        <ErrorState error={q.error} reset={() => void q.refetch()} />
      ) : (
        <div className="space-y-3">
          <Field label="How it is worked out">
            <Select value={kind} onChange={(e) => setKind(e.target.value)} disabled={!editable}>
              <option value="PERCENT">Percent of room rent</option>
              <option value="FLAT">Fixed amount per booking</option>
            </Select>
          </Field>
          <Field label={kind === "FLAT" ? `Commission (${cur()} per booking)` : "Commission (%)"}>
            <Input
              type="number"
              min={0}
              max={kind === "PERCENT" ? 100 : undefined}
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              disabled={!editable}
            />
          </Field>
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Every agent selling this resort earns on these terms. Changing them changes what agents see on
            the booking screen and what the agent report adds up.
          </p>
          {editable && (
            <Button onClick={() => void save()} loading={busy} disabled={!dirty || rate === ""}>
              Save commission
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

function UsersTab({ rid }: { rid: number }) {
  // a failed load used to render as "No team members yet", on a resort with staff
  const fail = useLoadFailure();
  const { push } = useToast();
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [roles, setRoles] = useState<PermRole[]>([]);
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", role: "FRONT_DESK", roleId: "" });
  const [busy, setBusy] = useState(false);
  const [contactEdit, setContactEdit] = useState<{ id: number; email: string; phone: string } | null>(null);
  const [contactBusy, setContactBusy] = useState(false);

  const load = useCallback(() => {
    // the roles list is shared with the Permissions tab and cached under one key
    api<UserRow[]>(`/resorts/${rid}/users`).then((r) => { setRows(r); fail.clear(); }).catch(fail.onFail(() => setRows([])));
    api<PermRole[]>(`/resorts/${rid}/roles`).then(setRoles).catch(() => setRoles([]));
  }, [rid]);
  useEffect(() => load(), [load]);

  async function create() {
    setBusy(true);
    try {
      await api(`/resorts/${rid}/users`, {
        method: "POST",
        body: {
          name: form.name, email: form.email, phone: form.phone, password: form.password, role: form.role,
          roleId: form.roleId ? Number(form.roleId) : undefined,
        },
      });
      push("Staff account created");
      setForm({ name: "", email: "", phone: "", password: "", role: "FRONT_DESK", roleId: "" });
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

  function startEditContact(u: UserRow) {
    // a placeholder is shown blank — the person editing types a real value,
    // never sees the fake one, and an untouched blank field stays "no change"
    setContactEdit({
      id: u.id,
      email: isPlaceholderEmail(u.email) ? "" : u.email ?? "",
      phone: isPlaceholderPhone(u.phone) ? "" : u.phone,
    });
  }

  async function saveContact(u: UserRow) {
    if (!contactEdit) return;
    const body = changedContactFields(
      { email: contactEdit.email, phone: contactEdit.phone },
      { email: u.email ?? "", phone: u.phone },
    );
    if (Object.keys(body).length === 0) {
      setContactEdit(null);
      return;
    }
    // only the fields that changed are checked — an untouched field, even a
    // blank one standing in for a placeholder, is not a value being submitted
    const err =
      (body.email !== undefined && emailError(body.email)) ||
      (body.phone !== undefined && phoneError(body.phone));
    if (err) {
      push(err, "err");
      return;
    }
    setContactBusy(true);
    try {
      await api(`/resorts/${rid}/users/${u.id}`, { method: "PATCH", body });
      push("Contact details updated");
      setContactEdit(null);
      load();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setContactBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Card title={`Team (${rows?.length ?? 0})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr><Th>Name</Th><Th>Contact</Th><Th>Role</Th><Th>Status</Th><Th /></tr>
            </thead>
            <tbody>
              {(rows ?? []).map((u) => (
                <tr key={u.id} className="border-t border-slate-100">
                  <Td>
                    <div className="font-semibold text-slate-800">{u.name}</div>
                  </Td>
                  <Td className="min-w-[220px]">
                    {contactEdit?.id === u.id ? (
                      <div className="space-y-1.5">
                        <Input
                          value={contactEdit.email}
                          onChange={(e) => setContactEdit({ ...contactEdit, email: e.target.value })}
                          placeholder={isPlaceholderEmail(u.email) ? "Not set yet — add a real email" : ""}
                          className="!py-1 text-xs"
                        />
                        <Input
                          value={contactEdit.phone}
                          onChange={(e) => setContactEdit({ ...contactEdit, phone: e.target.value })}
                          placeholder={isPlaceholderPhone(u.phone) ? "Not set yet — add a real phone" : ""}
                          className="!py-1 text-xs"
                        />
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => saveContact(u)}
                            disabled={contactBusy}
                            className="rounded-lg border border-emerald-200 px-2 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setContactEdit(null)}
                            disabled={contactBusy}
                            className="rounded-lg border border-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500">
                        <div>{displayEmail(u.email)}</div>
                        <div>{displayPhone(u.phone)}</div>
                        <button onClick={() => startEditContact(u)} className="mt-0.5 text-brand-600 hover:underline">
                          Edit
                        </button>
                      </div>
                    )}
                  </Td>
                  <Td>
                    <Select className="!w-36 !py-1" value={u.role} onChange={(e) => patch(u.id, { role: e.target.value })}>
                      {["RESORT_ADMIN", "MANAGER", "FRONT_DESK", "HOUSEKEEPING"].map((r) => (
                        <option key={r} value={r}>{r.replace(/_/g, " ")}</option>
                      ))}
                    </Select>
                    <RolePicker u={u} rid={rid} roles={roles} onDone={load} />
                  </Td>
                  <Td>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${u.status === "active" ? "bg-emerald-50 text-emerald-700" : u.status === "pending" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>{u.status}</span>
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-1.5">
                      {u.status !== "active" && (
                        <button onClick={() => patch(u.id, { status: "active" })} className="rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
                          <Check className="inline h-3.5 w-3.5" /> Activate
                        </button>
                      )}
                      {/* staff only: an agency sells the resort without being on its team */}
                      {u.status === "active" && (
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
          <LoadFailed error={fail.error} onRetry={load} />
          {!fail.error && rows?.length === 0 && <Empty msg="No team members yet" />}
        </div>
      </Card>

      <Card title="Add team member">
        <div className="space-y-3">
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Email (login)"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@resort.com" /></Field>
          <Field label="Phone (login)"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="8801XXXXXXXXX" /></Field>
          <Field label="Password"><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          <Field label="Role">
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value, roleId: "" })}>
              <option value="MANAGER">Manager</option>
              <option value="FRONT_DESK">Front desk</option>
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
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Selling through a travel agency? Agencies are not team members — open the resort to them, or invite one, on the Agent access tab.
          </div>
          <Button
            onClick={create}
            loading={busy}
            disabled={!form.name || !!emailError(form.email) || !!phoneError(form.phone) || !form.password}
          >
            Create account
          </Button>
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
  const isAdminRole = (r: PermRole) => r.system && r.name === "Administrator";
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
              {/* Administrator resolves to every permission there is, so its
                  boxes would decide nothing — a matrix that reads as control
                  and is not is worse than no matrix. */}
              {isAdminRole(r) ? (
                <span className="text-xs text-slate-400">everything</span>
              ) : (
                <button onClick={() => openEditor(r)} className="text-xs font-semibold text-brand-700 hover:underline">Edit</button>
              )}
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
    // this key is a customer's own website talking to us; revoking it takes
    // their booking form offline until they paste a new one in
    if (!window.confirm("Revoke this API key? Anything using it stops working immediately.")) return;
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
            <div className="mt-2"><span className="text-slate-500"># your resort&apos;s details</span></div>
            <div><span className="text-emerald-300">curl</span> {API_URL}/v1/resort \</div>
            <div className="pl-4">-H <span className="text-amber-300">&quot;X-Api-Key: …&quot;</span></div>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            The key reads; it does not sell. Your site can show its rooms, its rates and its free
            nights, and send the visitor to your phone number — a booking is taken at your desk or
            by one of your agents.
          </p>
        </Card>
      </div>

      <Card title="New API key">
        <div className="space-y-3">
          <Field label="Key name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My resort website" /></Field>
          <div className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
            Point your existing website at the availability endpoint — your live rooms and rates on
            your own site, with no second calendar to keep up to date.
          </div>
          <Button onClick={create} loading={busy} disabled={!name}>Generate key</Button>
        </div>
      </Card>
    </div>
  );
}

/**
 * The subscription, from the side of the person paying for it.
 *
 * Before this tab the console could not answer "what am I paying", "when does
 * it renew", "what do I owe" or "what would the next plan up cost me". The one
 * plan control in the product was hidden from the owner entirely, and wrote
 * `Tenant.plan` — a field the billing sweep does not read.
 *
 * Two things here are deliberate rather than decorative. An upgrade names its
 * pro-rata charge before it is pressed, because a button that takes money must
 * say how much. And a downgrade says which day it lands on, because a customer
 * who expects the cheaper price this month and gets billed the old one has been
 * misled by the interface, not the invoice.
 */
/**
 * Pay monthly, or pay for the year.
 *
 * Shown only where there is a choice — a plan with no yearly price gets no
 * control at all rather than a disabled half of one — and the saving is spelled
 * out in taka as well as a percentage, because "save 17%" of an unstated number
 * is not an amount anyone can decide on.
 */
function BillingCycleSwitch({
  detail,
  busy,
  onSwitch,
}: {
  detail: SubscriptionDetail;
  busy: string;
  onSwitch: (to: "MONTHLY" | "YEARLY") => void;
}) {
  const here = detail.plans.find((p) => p.name === detail.plan);
  if (!here?.yearlyFee) return null;
  // a switch already booked for the renewal is shown above; offering the same
  // move again here would be a button that does nothing
  if (detail.pendingCycle) return null;

  const yearly = detail.billingCycle === "YEARLY";
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
      <div className="text-xs text-slate-600">
        {yearly ? (
          <>
            Billed yearly — <b>{money(here.yearlyFee)}</b> a year
            {here.yearlySaving && <> , saving {money(here.yearlySaving.amount)} against monthly</>}
          </>
        ) : (
          <>
            Pay for a year and it is <b>{money(here.yearlyFee / 12)}</b> a month
            {here.yearlySaving && <> — {here.yearlySaving.pct}% off, {money(here.yearlySaving.amount)} a year</>}
          </>
        )}
      </div>
      <Button
        size="sm"
        variant={yearly ? "ghost" : "primary"}
        loading={busy === "__cycle"}
        onClick={() => onSwitch(yearly ? "MONTHLY" : "YEARLY")}
      >
        {yearly ? "Switch to monthly" : "Switch to yearly"}
      </Button>
    </div>
  );
}

function SubscriptionTab({ rid }: { rid: number }) {
  const { push } = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState("");

  const q = useApi(["subscription", rid], () => api<SubscriptionDetail>(`/resorts/${rid}/subscription`), {
    enabled: !!rid,
  });
  const d = q.data;

  /**
   * Move plan, keeping whatever rhythm the account is already on.
   *
   * Changing the rhythm is its own button below, because they are two separate
   * decisions and rolling them into one "upgrade" would change the size of the
   * bill without saying so.
   */
  async function change(p: PlanOption) {
    const cycle = d?.billingCycle ?? "MONTHLY";
    const per = cycle === "YEARLY" ? "year" : "month";
    const fee = money(cycle === "YEARLY" && p.yearlyFee != null ? p.yearlyFee : p.monthlyFee);
    if (cycle === "YEARLY" && p.yearlyFee == null) {
      window.alert(`${p.label} is sold by the month only. Switch to monthly billing first.`);
      return;
    }
    const ask =
      p.direction === "upgrade"
        ? `Move to ${p.label} (${fee}/${per})?\n\nIt applies immediately, and you are billed only the difference for the days left in this ${per}.`
        : p.direction === "current"
          ? `Stay on ${p.label} and call off the change?`
          : `Move down to ${p.label} (${fee}/${per})?\n\nYou keep ${d?.planLabel ?? "your current plan"} until ${when(d?.renewsAt)} — that ${per} is already paid for — and ${p.label} starts from then.`;
    if (!window.confirm(ask)) return;
    setBusy(p.name);
    try {
      const r = await api<PlanChange>(`/resorts/${rid}/subscription/plan`, { method: "POST", body: { plan: p.name, billingCycle: cycle } });
      push(
        r.effective === "now"
          ? r.charged > 0
            ? `On ${r.planLabel} — ${money(r.charged)} billed for the rest of this month`
            : `On ${r.planLabel}`
          : r.effective === "cancelled"
            ? `Staying on ${r.planLabel}`
            : `${r.planLabel} starts ${when(r.effectiveFrom)}`,
      );
      await qc.invalidateQueries({ queryKey: ["subscription", rid] });
      await qc.invalidateQueries({ queryKey: ["tenant-usage"] });
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy("");
    }
  }

  /**
   * Change how often you are billed, staying on the same plan.
   *
   * Going yearly is immediate: the year starts today, and the unused part of
   * the month already paid for comes off the bill. Going back to monthly waits
   * for the year to run out, for the same reason a downgrade does — that year
   * has been paid for and is not something to hand back mid-term.
   */
  async function switchCycle(to: "MONTHLY" | "YEARLY") {
    if (!d?.plan) return;
    const here = d.plans.find((p) => p.name === d.plan);
    if (to === "YEARLY" && !here?.yearlyFee) {
      window.alert(`${d.planLabel} is sold by the month only.`);
      return;
    }
    const ask =
      to === "YEARLY"
        ? `Pay for a year of ${d.planLabel} up front — ${money(here!.yearlyFee!)}?\n\nThat is ${money(here!.yearlyFee! / 12)} a month${here!.yearlySaving ? `, saving ${money(here!.yearlySaving.amount)} a year` : ""}. The year starts today, and what is left of the month you have paid for comes off the bill.`
        : `Go back to monthly billing?\n\nYou keep the year you have paid for until ${when(d.renewsAt)}; monthly billing starts from then.`;
    if (!window.confirm(ask)) return;
    setBusy("__cycle");
    try {
      const r = await api<PlanChange>(`/resorts/${rid}/subscription/plan`, {
        method: "POST",
        body: { plan: d.plan, billingCycle: to },
      });
      push(
        r.effective === "now"
          ? r.charged > 0
            ? `Billed yearly — ${money(r.charged)} due now`
            : "Billed yearly"
          : `Monthly billing starts ${when(r.effectiveFrom)}`,
      );
      await qc.invalidateQueries({ queryKey: ["subscription", rid] });
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy("");
    }
  }

  // a screen that cannot load says so, rather than reading as "no subscription"
  if (q.error) return <ErrorState error={q.error} reset={() => void q.refetch()} />;
  if (!d) return <Empty msg="Loading…" />;

  return (
    <div className="max-w-3xl space-y-4">
      {d.outstanding.count > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <b>{money(d.outstanding.amount)}</b> outstanding across {d.outstanding.count} bill
          {d.outstanding.count === 1 ? "" : "s"}. Unpaid bills eventually suspend the resort — you are
          warned before that happens.
        </div>
      )}

      <Card title={d.plan ? `Your plan — ${d.planLabel}` : "No subscription yet"}>
        {d.plan ? (
          <>
            <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
              <Stat label="Status" value={STATUS_LABEL[d.status] ?? d.status} />
              <Stat
                label={d.billingCycle === "YEARLY" ? "Yearly" : "Monthly"}
                value={money(d.fee)}
                // the per-month figure beside a yearly fee, because that is the
                // number the customer compares against everything else
                sub={d.billingCycle === "YEARLY" ? `${money(d.feePerMonth)}/month` : undefined}
              />
              <Stat
                label={d.status === "TRIAL" ? "Trial ends" : "Renews"}
                value={when(d.status === "TRIAL" ? d.trialEndsAt : d.renewsAt)}
              />
              <Stat
                label="Rooms"
                value={`${d.usage.rooms}/${d.limits.maxRooms}`}
                sub={`${d.usage.resorts}/${d.limits.maxResorts} resorts`}
              />
            </div>
            {d.pendingPlan && (
              <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Moving to <b>{d.pendingPlanLabel}</b> on {when(d.renewsAt)}. Choose {d.planLabel} again to
                stay where you are.
              </div>
            )}
            {d.pendingCycle && (
              <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Switching to <b>{d.pendingCycle === "YEARLY" ? "yearly" : "monthly"}</b> billing on{" "}
                {when(d.renewsAt)}.
              </div>
            )}
            <BillingCycleSwitch detail={d} busy={busy} onSwitch={switchCycle} />
          </>
        ) : (
          <p className="text-sm text-slate-500">
            This resort is not on a subscription. The platform sets the first one up — the prices below are
            what it would cost.
          </p>
        )}
      </Card>

      <Card title="Plans">
        <div className="grid gap-3 sm:grid-cols-3">
          {d.plans.map((p) => (
            <div
              key={p.name}
              className={`rounded-lg border p-3 ${p.direction === "current" ? "border-brand-300 bg-brand-50" : "border-slate-200"}`}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-bold text-slate-800">{p.label}</span>
                {p.direction === "current" && (
                  <span className="text-[10px] font-bold uppercase text-brand-600">Current</span>
                )}
              </div>
              {/* priced in the rhythm this account is on, so the number beside
                  "Upgrade" is the number the bill will carry */}
              <div className="mt-1 text-lg font-black tabular-nums text-slate-900">
                {money(d.billingCycle === "YEARLY" && p.yearlyFee != null ? p.yearlyFee / 12 : p.monthlyFee)}
                <span className="text-xs font-medium text-slate-400">/mo</span>
              </div>
              <div className="text-[11px] text-slate-500">
                {d.billingCycle === "YEARLY"
                  ? p.yearlyFee != null
                    ? `${money(p.yearlyFee)} a year`
                    : "Monthly only"
                  : p.yearlySaving
                    ? `${money(p.yearlyFee!)} a year — save ${p.yearlySaving.pct}%`
                    : ""}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                {p.maxRooms >= 1000 ? "Unlimited rooms" : `${p.maxRooms} rooms`} · {p.maxResorts} resort
                {p.maxResorts === 1 ? "" : "s"}
              </div>
              {p.blurb && <div className="mt-1 text-[11px] text-slate-400">{p.blurb}</div>}
              {d.plan && p.direction !== "current" && (
                <Button
                  className="mt-2 w-full"
                  size="sm"
                  variant={p.direction === "upgrade" ? "primary" : "ghost"}
                  loading={busy === p.name}
                  onClick={() => void change(p)}
                >
                  {p.direction === "upgrade" ? "Upgrade" : "Move down"}
                </Button>
              )}
              {d.plan && p.direction === "current" && d.pendingPlan && (
                <Button
                  className="mt-2 w-full"
                  size="sm"
                  variant="ghost"
                  loading={busy === p.name}
                  onClick={() => void change(p)}
                >
                  Stay on {p.label}
                </Button>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card title="Bills" className="!p-0">
        {d.bills.length === 0 ? (
          <div className="p-4">
            <Empty msg="No bills yet" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr>
                  <Th>Period</Th>
                  <Th>Amount</Th>
                  <Th>Due</Th>
                  <Th>Status</Th>
                  <Th>Note</Th>
                </tr>
              </thead>
              <tbody>
                {d.bills.map((b) => (
                  <tr key={b.id} className="border-t border-slate-100">
                    <Td>
                      {when(b.periodStart)} → {when(b.periodEnd)}
                    </Td>
                    <Td className="tabular-nums">{money(b.amount)}</Td>
                    <Td>{when(b.dueDate)}</Td>
                    <Td>
                      {b.status === "PAID" ? (
                        <span className="text-emerald-600">Paid {when(b.paidAt)}</span>
                      ) : (
                        <span className={b.status === "OVERDUE" ? "text-red-600" : "text-slate-600"}>
                          {b.status}
                        </span>
                      )}
                    </Td>
                    <Td className="text-xs text-slate-400">{b.note ?? ""}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  TRIAL: "Free trial",
  ACTIVE: "Active",
  PAST_DUE: "Past due",
  NONE: "None",
};

/** A date the owner reads, rather than an ISO string. */
function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
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
