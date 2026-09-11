"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AGENT_PERMISSIONS, PERMISSIONS } from "@rh/shared";
import { useAuth } from "@/lib/auth";
import { Badge, Button, Card, Empty, Field, Input, Select, Spinner, Td, Th, useToast } from "@/components/ui";
import { Table, Tabs } from "@/components/patterns";
import { ErrorState } from "@/components/error-state";
import { ShieldCheck, UserPlus } from "lucide-react";
import { emailError, isPlaceholderEmail, isPlaceholderPhone, phoneError } from "@/lib/contact";

/**
 * An agency's own team.
 *
 * An agency could add staff and every one of them got identical powers —
 * there was no way to hire a junior who books but cannot see the agency's
 * money, which is the first thing anyone hiring a junior wants. And the
 * agency had no activity log at all, so it could not answer "who cancelled
 * that booking" about its own people.
 */

interface StaffRow {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  status: string;
  agentRoleId?: number | null;
}

interface RoleRow {
  id: number;
  name: string;
  permissions: string[];
  staff: number;
}

interface ActivityRow {
  id: string;
  actor: { id: number; name: string } | null;
  resort: { id: number; name: string } | null;
  action: string;
  entity: string;
  entityId: number | null;
  at: string;
}

const TABS = ["People", "Roles", "Activity"] as const;

/** The label an owner reads, taken from the same list the settings screen uses. */
const labelFor = (key: string) => PERMISSIONS.find((p) => p.key === key)?.label ?? key;

export default function AgentTeamPage() {
  const { role } = useAuth();
  const { push } = useToast();
  const [tab, setTab] = useState<(typeof TABS)[number]>("People");
  const [staff, setStaff] = useState<StaffRow[] | null>(null);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<StaffRow[]>("/agent/staff").then(setStaff).catch((e) => setError(e as Error));
    api<RoleRow[]>("/agent/roles").then(setRoles).catch(() => setRoles([]));
  }, []);
  useEffect(() => load(), [load]);

  if (role !== "AGENT") return <Empty msg="Agents only" />;
  if (error) return <ErrorState error={error} />;

  async function addStaff() {
    setBusy(true);
    try {
      await api("/agent/staff", { method: "POST", body: form });
      push(`${form.name} can now sign in`);
      setForm({ name: "", email: "", phone: "", password: "" });
      load();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function setRole(userId: number, roleId: string) {
    try {
      await api(`/agent/staff/${userId}/role`, {
        method: "PATCH",
        body: { roleId: roleId ? Number(roleId) : null },
      });
      push("Role updated");
      load();
    } catch (ex) {
      push((ex as Error).message, "err");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">My team</h1>
        <p className="text-sm text-slate-500">Who works for this agency, what each of them may do, and what they did.</p>
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === "People" && (
        <div className="space-y-4">
          <Card className="!p-0" title={`People (${staff?.length ?? 0})`}>
            {staff === null ? (
              <Spinner />
            ) : staff.length === 0 ? (
              <Empty msg="Nobody yet — add your first colleague below" />
            ) : (
              <Table minWidth={640}>
                <thead className="border-b border-slate-100">
                  <tr><Th>Name</Th><Th>Contact</Th><Th>Role</Th><Th>Status</Th></tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {staff.map((s) => (
                    <tr key={s.id}>
                      <Td className="font-medium">{s.name}</Td>
                      <Td className="text-xs text-slate-500">
                        {[
                          s.email && !isPlaceholderEmail(s.email) ? s.email : null,
                          s.phone && !isPlaceholderPhone(s.phone) ? s.phone : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "not set"}
                      </Td>
                      <Td>
                        <Select
                          value={String(s.agentRoleId ?? "")}
                          onChange={(e) => setRole(s.id, e.target.value)}
                          className="!w-44"
                        >
                          <option value="">Default (book &amp; wallet)</option>
                          {roles.map((r) => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </Select>
                      </Td>
                      <Td><Badge value={s.status} /></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card title="Add someone">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Email"><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
              <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
              <Field label="Temporary password" hint="at least 8 characters; they can change it in Profile">
                <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </Field>
            </div>
            <div className="mt-3 flex justify-end">
              <Button
                loading={busy}
                onClick={addStaff}
                disabled={!form.name || !!emailError(form.email) || !!phoneError(form.phone) || !form.password}
              >
                <UserPlus className="mr-1 h-4 w-4" /> Add
              </Button>
            </div>
          </Card>
        </div>
      )}

      {tab === "Roles" && <RolesTab roles={roles} reload={load} />}
      {tab === "Activity" && <ActivityTab />}
    </div>
  );
}

function RolesTab({ roles, reload }: { roles: RoleRow[]; reload: () => void }) {
  const { push } = useToast();
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>(["agent.book"]);
  const [busy, setBusy] = useState(false);

  const toggle = (key: string) =>
    setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));

  async function create() {
    setBusy(true);
    try {
      await api("/agent/roles", { method: "POST", body: { name, permissions: picked } });
      push(`Role "${name}" created`);
      setName("");
      setPicked(["agent.book"]);
      reload();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!window.confirm("Delete this role? Anyone on it goes back to the default.")) return;
    try {
      await api(`/agent/roles/${id}`, { method: "DELETE" });
      reload();
    } catch (ex) {
      push((ex as Error).message, "err");
    }
  }

  return (
    <div className="space-y-4">
      <Card className="!p-0" title="Roles">
        {roles.length === 0 ? (
          <Empty msg="No roles yet — everyone gets the default set" />
        ) : (
          <Table minWidth={560}>
            <thead className="border-b border-slate-100">
              <tr><Th>Role</Th><Th>Can</Th><Th className="text-right">People</Th><Th /></tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {roles.map((r) => (
                <tr key={r.id}>
                  <Td className="font-medium">{r.name}</Td>
                  <Td className="text-xs text-slate-500">{r.permissions.map(labelFor).join(" · ")}</Td>
                  <Td className="text-right">{r.staff}</Td>
                  <Td className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => remove(r.id)}>Delete</Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title="New role">
        <p className="mb-3 text-xs text-slate-500">
          Tick exactly what this role may do. You keep everything yourself — only staff can be given less.
        </p>
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Junior booker" /></Field>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {AGENT_PERMISSIONS.map((key) => (
            <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <input type="checkbox" checked={picked.includes(key)} onChange={() => toggle(key)} />
              {labelFor(key)}
            </label>
          ))}
        </div>
        <div className="mt-3 flex justify-end">
          <Button loading={busy} onClick={create} disabled={!name || picked.length === 0}>
            <ShieldCheck className="mr-1 h-4 w-4" /> Create role
          </Button>
        </div>
      </Card>
    </div>
  );
}

function ActivityTab() {
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [q, setQ] = useState("");
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      api<ActivityRow[]>(`/agent/activity${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`)
        .then((r) => {
          setRows(r);
          setDenied(false);
        })
        .catch(() => {
          setRows([]);
          setDenied(true);
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  if (denied) return <Empty msg="You do not have access to the activity log" />;

  return (
    <Card
      className="!p-0"
      title="Activity"
      action={<Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search action or person…" className="!w-60" />}
    >
      {rows === null ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Empty msg="Nothing yet" />
      ) : (
        <Table minWidth={640}>
          <thead className="border-b border-slate-100">
            <tr><Th>When</Th><Th>Who</Th><Th>Did</Th><Th>Where</Th></tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((r) => (
              <tr key={r.id}>
                <Td className="text-xs text-slate-500">{new Date(r.at).toLocaleString()}</Td>
                <Td className="text-sm">{r.actor?.name ?? "—"}</Td>
                <Td className="font-mono text-xs">{r.action}{r.entityId ? ` #${r.entityId}` : ""}</Td>
                <Td className="text-xs text-slate-500">{r.resort?.name ?? "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
