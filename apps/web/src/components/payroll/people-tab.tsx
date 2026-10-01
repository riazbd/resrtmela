"use client";

/**
 * Payroll's people, beside the app's logins.
 *
 * Two lists that mostly overlap — who is paid a salary, and who can sign in —
 * and the owner could see neither against the other. So: everyone on payroll
 * with the login they use (or plainly none), then the logins nobody has put
 * on payroll, each one tap from being added. Anyone who has left is kept
 * below, with the day they left.
 */

import { useMemo, useState } from "react";
import { KeyRound, LogOut, Pencil, Plus, UserPlus } from "lucide-react";
import { monthName, type PayrollPeople, type PayrollPerson } from "@rh/shared";
import { money, cur } from "@/lib/api";
import { useApi } from "@/lib/query";
import { Button, Card, Empty, Field, Input, Modal, Select, Spinner, useToast } from "@/components/ui";
import { ErrorState } from "@/components/error-state";
import type { PayrollAdapter } from "./adapter";
import { LoginChip } from "./bits";

const day = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : null;

type Draft = {
  id?: number;
  name: string;
  phone: string;
  designation: string;
  salary: string;
  joinDate: string;
  leftDate: string;
  userId: string;
};

const blank: Draft = { name: "", phone: "", designation: "", salary: "", joinDate: "", leftDate: "", userId: "" };

export function PeopleTab({ a }: { a: PayrollAdapter }) {
  const { push } = useToast();
  const q = useApi(a.peopleKey, () => a.people());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [leaving, setLeaving] = useState<PayrollPerson | null>(null);
  const data: PayrollPeople | undefined = q.data;

  const current = useMemo(() => (data?.people ?? []).filter((p) => p.active), [data]);
  const former = useMemo(() => (data?.people ?? []).filter((p) => !p.active), [data]);
  const monthly = current.reduce((s, p) => s + p.salary, 0);

  if (q.error) return <ErrorState error={q.error as Error} />;
  if (!data) return <Spinner />;

  async function rejoin(p: PayrollPerson) {
    try {
      await a.editEmployee(p.id, { active: true });
      push(`${p.name} is back on payroll`);
      a.invalidate();
    } catch (ex) {
      push((ex as Error).message, "err");
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card
          className="!p-0"
          title={`On payroll (${current.length}) · ${money(monthly)} a month`}
          action={
            a.canManage && (
              <Button size="sm" onClick={() => setDraft({ ...blank, joinDate: a.today })}>
                <Plus className="h-4 w-4" /> Add someone
              </Button>
            )
          }
        >
          {current.length === 0 ? (
            <Empty msg="Nobody on payroll yet" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {current.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-sm font-bold text-white">
                    {p.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-800">{p.name}</span>
                      {p.designation && <span className="text-xs text-slate-400">{p.designation}</span>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                      <LoginChip login={p.login} />
                      <span>{p.joinDate ? `joined ${day(p.joinDate)}` : `on the books since ${monthName(p.since)}`}</span>
                      {p.phone && <span>· {p.phone}</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold tabular-nums text-slate-800">{money(p.salary)}</div>
                    <div className="text-[11px] text-slate-400">a month</div>
                  </div>
                  {a.canManage && (
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Edit ${p.name}`}
                        onClick={() =>
                          setDraft({
                            id: p.id,
                            name: p.name,
                            phone: p.phone ?? "",
                            designation: p.designation ?? "",
                            salary: String(p.salary),
                            joinDate: p.joinDate ?? "",
                            leftDate: p.leftDate ?? "",
                            userId: p.login ? String(p.login.userId) : "",
                          })
                        }
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setLeaving(p)}>
                        <LogOut className="h-3.5 w-3.5 text-red-600" /> Left
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="!p-0" title={`App logins not on payroll (${data.team.length})`}>
          <p className="px-4 pt-3 text-xs text-slate-500">
            These people can sign in to the app but nobody has put them on payroll. If you pay them a salary, add them — it links their login too.
            {a.owner === "resort" && " Agents are not listed: they earn commission."}
          </p>
          {data.team.length === 0 ? (
            <Empty msg="Every login is on payroll" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.team.map((t) => (
                <li key={t.userId} className="flex items-center gap-3 px-4 py-2.5">
                  <KeyRound className="h-4 w-4 shrink-0 text-sky-500" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-800">{t.name}</div>
                    <div className="text-[11px] text-slate-400">{t.role}</div>
                  </div>
                  {a.canManage && (
                    <Button size="sm" variant="ghost" onClick={() => setDraft({ ...blank, name: t.name, phone: t.phone ?? "", designation: t.role, userId: String(t.userId), joinDate: a.today })}>
                      <UserPlus className="h-3.5 w-3.5" /> Put on payroll
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {former.length > 0 && (
        <Card className="!p-0" title={`Left (${former.length})`}>
          <ul className="divide-y divide-slate-100">
            {former.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-slate-600">{p.name}</span>
                  {p.designation && <span className="ml-2 text-xs text-slate-400">{p.designation}</span>}
                </span>
                <span className="text-xs text-slate-400">{p.leftDate ? `left ${day(p.leftDate)}` : "off payroll"}</span>
                {a.canManage && (
                  <Button size="sm" variant="ghost" onClick={() => rejoin(p)}>
                    Back on payroll
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {draft && <PersonForm a={a} draft={draft} logins={data} onClose={() => setDraft(null)} />}
      {leaving && <LeaveForm a={a} person={leaving} onClose={() => setLeaving(null)} />}
    </div>
  );
}

function PersonForm({ a, draft, logins, onClose }: { a: PayrollAdapter; draft: Draft; logins: PayrollPeople; onClose: () => void }) {
  const { push } = useToast();
  const [f, setF] = useState<Draft>(draft);
  const [busy, setBusy] = useState(false);
  const linked = logins.people.find((p) => p.id === draft.id)?.login;
  const choices = [...(linked ? [{ userId: linked.userId, name: linked.name, role: linked.role }] : []), ...logins.team];

  async function save() {
    setBusy(true);
    try {
      const body = {
        name: f.name.trim(),
        phone: f.phone,
        designation: f.designation,
        salary: Number(f.salary || 0),
        joinDate: f.joinDate,
        userId: Number(f.userId || 0),
      };
      if (f.id) {
        await a.editEmployee(f.id, { ...body, leftDate: f.leftDate });
        push(`${body.name} saved`);
      } else {
        await a.addEmployee({ ...body, joinDate: f.joinDate || undefined, userId: body.userId || undefined });
        push(`${body.name} is on payroll`);
      }
      a.invalidate();
      onClose();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={f.id ? `Edit — ${draft.name}` : "Put someone on payroll"}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
        </Field>
        <Field label="Designation">
          <Input value={f.designation} onChange={(e) => setF({ ...f, designation: e.target.value })} placeholder="Cook, Guard, Front desk" />
        </Field>
        <Field label={`Monthly salary (${cur()})`}>
          <Input type="number" min={0} value={f.salary} onChange={(e) => setF({ ...f, salary: e.target.value })} />
        </Field>
        <Field label="Phone" hint="optional">
          <Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </Field>
        <Field label="Joined" hint="the first month is paid for the days from here">
          <Input type="date" value={f.joinDate} onChange={(e) => setF({ ...f, joinDate: e.target.value })} />
        </Field>
        {f.id ? (
          <Field label="Left" hint="empty while they still work here">
            <Input type="date" value={f.leftDate} onChange={(e) => setF({ ...f, leftDate: e.target.value })} />
          </Field>
        ) : (
          <div />
        )}
        <Field label="App login" hint="who they sign in as, if they use the app">
          <Select value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })}>
            <option value="">No app login</option>
            {choices.map((c) => (
              <option key={c.userId} value={c.userId}>
                {c.name} — {c.role}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button loading={busy} onClick={save} disabled={!f.name.trim()}>
          {f.id ? "Save" : "Put on payroll"}
        </Button>
      </div>
    </Modal>
  );
}

/** Off payroll, on a day: the month they leave in is paid for the days up to it. */
function LeaveForm({ a, person, onClose }: { a: PayrollAdapter; person: PayrollPerson; onClose: () => void }) {
  const { push } = useToast();
  const [on, setOn] = useState(a.today);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const r = await a.removeEmployee(person.id, on);
      push(r.deactivated ? `${person.name} is off payroll from ${day(on)} — their history stays` : `${person.name} removed`);
      a.invalidate();
      onClose();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={`${person.name} has left`}>
      <p className="mb-3 text-sm text-slate-500">
        Their last month is paid for the days up to their last day. Everything already paid stays on the books. Somebody never paid is simply removed.
      </p>
      <Field label="Last day of work">
        <Input type="date" value={on} onChange={(e) => setOn(e.target.value)} />
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" loading={busy} onClick={save}>
          Take off payroll
        </Button>
      </div>
    </Modal>
  );
}
