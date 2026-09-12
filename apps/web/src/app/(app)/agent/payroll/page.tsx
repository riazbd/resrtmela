"use client";

import { useState } from "react";
import { api, money } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi, keys, useQueryClient } from "@/lib/query";
import { Badge, Button, Card, Empty, Field, Input, Modal, Spinner, Stat, Td, Th, useToast } from "@/components/ui";
import { Table, Tabs } from "@/components/patterns";
import { ErrorState } from "@/components/error-state";
import { Plus, Trash2 } from "lucide-react";
import type { AgencyEmployee, PayrollSheet } from "@rh/shared";

/**
 * The agency's payroll.
 *
 * The same monthly sheet the resort side has, owned by an agency instead of a
 * resort. One person, one month, one payment — enforced in the database, not
 * by hoping nobody presses the button twice.
 */

const TABS = ["This month", "People"] as const;

const thisMonth = () => new Date().toISOString().slice(0, 7);

export default function AgencyPayrollPage() {
  const { role, can } = useAuth();
  const [tab, setTab] = useState<(typeof TABS)[number]>("This month");

  if (role !== "AGENT") return <Empty msg="Agents only" />;
  if (!can("agent.payroll.manage")) return <Empty msg="You do not have access to the agency's payroll" />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Payroll</h1>
        <p className="text-sm text-slate-500">Who the agency pays, and what has gone out this month.</p>
      </div>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === "This month" ? <SheetTab /> : <PeopleTab />}
    </div>
  );
}

function SheetTab() {
  const qc = useQueryClient();
  const { push } = useToast();
  const [month, setMonth] = useState(thisMonth());
  const { data, isLoading, error, stale } = useApi<PayrollSheet>(keys.agentPayroll(month), () =>
    api<PayrollSheet>(`/agent/payroll?month=${month}`),
  );

  if (error) return <ErrorState error={error as Error} />;

  const reload = () => qc.invalidateQueries({ queryKey: ["agent"] });

  async function pay(employeeId: number, amount: number, name: string) {
    try {
      await api(`/agent/payroll/${employeeId}`, { method: "POST", body: { month, amount } });
      push(`${name} paid for ${month}`);
      reload();
    } catch (ex) {
      push((ex as Error).message, "err");
    }
  }

  async function undo(paymentId: number) {
    if (!window.confirm("Undo this payment?")) return;
    try {
      await api(`/agent/payroll/payment/${paymentId}`, { method: "DELETE" });
      reload();
    } catch (ex) {
      push((ex as Error).message, "err");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Month">
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="On the payroll" value={String(data?.totals.headcount ?? 0)} />
        <Stat label="Expected" value={money(data?.totals.expected ?? 0)} />
        <Stat
          label="Paid"
          value={money(data?.totals.paid ?? 0)}
          tone={data && data.totals.paid >= data.totals.expected && data.totals.expected > 0 ? "green" : undefined}
        />
        <Stat
          label="Still to pay"
          value={money(Math.max(0, (data?.totals.expected ?? 0) - (data?.totals.paid ?? 0)))}
          tone={data && data.totals.paid < data.totals.expected ? "amber" : undefined}
        />
      </div>

      <Card className="!p-0" title={`Sheet for ${month}`}>
        {isLoading && !data ? (
          <Spinner />
        ) : (data?.rows ?? []).length === 0 ? (
          <Empty msg="Nobody on the payroll yet — add people on the People tab" />
        ) : (
          <Table minWidth={640}>
            <thead className="border-b border-slate-100">
              <tr>
                <Th>Name</Th>
                <Th>Role</Th>
                <Th className="text-right">Salary</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(data?.rows ?? []).map((r) => (
                <tr key={r.employeeId}>
                  <Td className="font-medium">{r.name}</Td>
                  <Td className="text-xs text-slate-500">{r.designation ?? "—"}</Td>
                  <Td className="text-right font-medium">{money(r.salary)}</Td>
                  <Td>{r.paid ? <Badge value="paid" /> : <Badge value="due" />}</Td>
                  <Td className="text-right">
                    {r.paid ? (
                      <Button size="sm" variant="ghost" onClick={() => undo(r.paymentId!)}>
                        Undo
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => pay(r.employeeId, r.salary, r.name)}>
                        Pay {money(r.salary)}
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {stale && (
          <div className="border-t border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
            Showing what was saved on this device {stale} — you appear to be offline. Paying someone
            needs a connection.
          </div>
        )}
      </Card>
    </div>
  );
}

function PeopleTab() {
  const qc = useQueryClient();
  const { push } = useToast();
  const [adding, setAdding] = useState(false);
  const { data, isLoading, error } = useApi<AgencyEmployee[]>(keys.agentEmployees(), () =>
    api<AgencyEmployee[]>("/agent/employees"),
  );

  if (error) return <ErrorState error={error as Error} />;

  const reload = () => qc.invalidateQueries({ queryKey: ["agent"] });

  async function remove(emp: AgencyEmployee) {
    if (!window.confirm(`Remove ${emp.name} from the payroll?`)) return;
    try {
      const result = await api<{ deactivated?: boolean }>(`/agent/employees/${emp.id}`, { method: "DELETE" });
      push(
        result.deactivated
          ? `${emp.name} is off the payroll — what they were already paid stays on the books`
          : `${emp.name} removed`,
      );
      reload();
    } catch (ex) {
      push((ex as Error).message, "err");
    }
  }

  return (
    <div className="space-y-4">
      <Card
        className="!p-0"
        title={`People (${data?.length ?? 0})`}
        action={
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add someone
          </Button>
        }
      >
        {isLoading && !data ? (
          <Spinner />
        ) : (data ?? []).length === 0 ? (
          <Empty msg="Nobody on the payroll yet" />
        ) : (
          <Table minWidth={680}>
            <thead className="border-b border-slate-100">
              <tr>
                <Th>Name</Th>
                <Th>Role</Th>
                <Th>Phone</Th>
                <Th className="text-right">Salary</Th>
                <Th>Recently paid</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(data ?? []).map((e) => (
                <tr key={e.id}>
                  <Td className="font-medium">
                    {e.name} {!e.active && <Badge value="inactive" />}
                  </Td>
                  <Td className="text-xs text-slate-500">{e.designation ?? "—"}</Td>
                  <Td className="text-xs text-slate-500">{e.phone ?? "—"}</Td>
                  <Td className="text-right font-medium">{money(e.salary)}</Td>
                  <Td className="text-xs text-slate-500">
                    {e.recent.length === 0 ? "—" : e.recent.map((p) => p.month).join(", ")}
                  </Td>
                  <Td className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => remove(e)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-600" />
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {adding && (
        <AddPerson
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

function AddPerson({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { push } = useToast();
  const [form, setForm] = useState({ name: "", phone: "", designation: "", salary: "", joinDate: "" });
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api("/agent/employees", {
        method: "POST",
        body: { ...form, salary: Number(form.salary || 0), joinDate: form.joinDate || undefined },
      });
      push(`${form.name} added`);
      onDone();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Add someone to the payroll">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
        </Field>
        <Field label="Role">
          <Input
            value={form.designation}
            onChange={(e) => setForm({ ...form, designation: e.target.value })}
            placeholder="Counter, Accounts, Driver"
          />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="Monthly salary">
          <Input
            type="number"
            value={form.salary}
            onChange={(e) => setForm({ ...form, salary: e.target.value })}
          />
        </Field>
        <Field label="Joined" hint="optional">
          <Input
            type="date"
            value={form.joinDate}
            onChange={(e) => setForm({ ...form, joinDate: e.target.value })}
          />
        </Field>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button loading={busy} onClick={save} disabled={!form.name.trim()}>
          Add
        </Button>
      </div>
    </Modal>
  );
}
