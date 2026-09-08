"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, money, type Employee, type PayrollSheet, cur } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Card, Empty, Field, Input, Select, useToast, Th, Td } from "@/components/ui";
import { Check, Undo2, Pencil, Plus } from "lucide-react";

function monthOptions() {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < 15; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export default function PayrollPage() {
  const { activeResort, isStaff, can } = useAuth();
  const { push } = useToast();
  const rid = activeResort?.id;
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [sheet, setSheet] = useState<PayrollSheet | null>(null);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [form, setForm] = useState({ name: "", phone: "", designation: "", salary: "" });
  const [editing, setEditing] = useState<Employee | null>(null);
  const [busy, setBusy] = useState(false);
  const canManage = isStaff && can("payroll.manage");
  const months = useMemo(() => monthOptions(), []);

  const load = useCallback(() => {
    if (!rid) return;
    api<Employee[]>(`/resorts/${rid}/payroll/employees`).then(setEmployees).catch(() => setEmployees([]));
    api<PayrollSheet>(`/resorts/${rid}/payroll?month=${month}`).then(setSheet).catch(() => setSheet(null));
  }, [rid, month]);
  useEffect(() => load(), [load]);

  if (!isStaff) return <Empty msg="Staff only" />;

  async function saveEmployee() {
    if (!rid) return;
    setBusy(true);
    try {
      const body = {
        name: editing ? editing.name : form.name,
        phone: editing ? (editing.phone ?? "") : form.phone,
        designation: editing ? (editing.designation ?? "") : form.designation,
        salary: Number(editing ? editing.salary : form.salary) || 0,
      };
      if (editing) {
        await api(`/resorts/${rid}/payroll/employees/${editing.id}`, { method: "PATCH", body });
        push("Staff updated");
        setEditing(null);
      } else {
        await api(`/resorts/${rid}/payroll/employees`, { method: "POST", body });
        push("Staff added");
        setForm({ name: "", phone: "", designation: "", salary: "" });
      }
      load();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function pay(employeeId: number) {
    if (!rid) return;
    try {
      await api(`/resorts/${rid}/payroll/employees/${employeeId}/pay`, { method: "POST", body: { month } });
      push(`Salary recorded for ${month}`);
      load();
    } catch (ex) {
      push((ex as Error).message, "err");
    }
  }

  async function undo(paymentId: number) {
    if (!window.confirm("Undo this salary payment?")) return;
    try {
      await api(`/payroll/payments/${paymentId}`, { method: "DELETE" });
      load();
    } catch (ex) {
      push((ex as Error).message, "err");
    }
  }

  async function deactivate(emp: Employee) {
    if (!rid) return;
    try {
      const r = await api<{ deactivated?: boolean; deleted?: boolean }>(`/resorts/${rid}/payroll/employees/${emp.id}`, { method: "DELETE" });
      push(r.deactivated ? "Staff deactivated (history kept)" : "Staff removed");
      load();
    } catch (ex) {
      push((ex as Error).message, "err");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Payroll</h1>
          <p className="text-sm text-slate-500">{activeResort?.name} — resort staff salaries</p>
        </div>
        <Select className="!w-36" value={month} onChange={(e) => setMonth(e.target.value)}>
          {months.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </Select>
      </div>

      {sheet && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Staff" value={String(sheet.totals.headcount)} />
          <Stat label="Paid" value={`${sheet.totals.paidCount}/${sheet.totals.headcount}`} />
          <Stat label="Expected" value={money(sheet.totals.expected)} />
          <Stat label="Disbursed" value={money(sheet.totals.paid)} />
        </div>
      )}

      <Card title={`Salary sheet — ${month}`}>
        {!sheet ? <Empty msg="Loading…" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr><Th>Staff</Th><Th>Designation</Th><Th>Salary</Th><Th>Status</Th><Th>Paid</Th><Th /></tr>
              </thead>
              <tbody>
                {sheet.rows.map((r) => (
                  <tr key={r.employeeId} className="border-t border-slate-100">
                    <Td className="font-semibold text-slate-800">{r.name}</Td>
                    <Td className="text-xs text-slate-500">{r.designation ?? "—"}</Td>
                    <Td>{money(r.salary)}</Td>
                    <Td>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${r.paid ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                        {r.paid ? "PAID" : "DUE"}
                      </span>
                    </Td>
                    <Td className="text-xs text-slate-500">
                      {r.paid ? `${money(r.amount)} · ${r.method ?? ""} · ${r.paidAt ? new Date(r.paidAt).toLocaleDateString("en-GB") : ""}` : "—"}
                    </Td>
                    <Td>
                      <div className="flex justify-end gap-1.5">
                        {canManage && !r.paid && (
                          <button onClick={() => pay(r.employeeId)} className="rounded-lg border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
                            <Check className="inline h-3.5 w-3.5" /> Pay
                          </button>
                        )}
                        {canManage && r.paid && r.paymentId && (
                          <button onClick={() => undo(r.paymentId!)} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                            <Undo2 className="inline h-3.5 w-3.5" /> Undo
                          </button>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sheet.rows.length === 0 && <Empty msg="No active staff yet — add them below" />}
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Staff list (${employees?.filter((e) => e.active).length ?? 0} active)`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr><Th>Name</Th><Th>Phone</Th><Th>Salary</Th><Th /></tr>
              </thead>
              <tbody>
                {(employees ?? []).map((e) => (
                  <tr key={e.id} className={`border-t border-slate-100 ${e.active ? "" : "opacity-50"}`}>
                    <Td>
                      <div className="font-semibold text-slate-800">{e.name}</div>
                      <div className="text-xs text-slate-400">{e.designation ?? ""} {e.active ? "" : "· inactive"}</div>
                    </Td>
                    <Td className="text-xs">{e.phone ?? "—"}</Td>
                    <Td>{money(e.salary)}</Td>
                    <Td>
                      <div className="flex justify-end gap-1.5">
                        {canManage && (
                          <>
                            <button onClick={() => setEditing(e)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                              <Pencil className="inline h-3.5 w-3.5" />
                            </button>
                            {e.active && (
                              <button onClick={() => deactivate(e)} className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">
                                Remove
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
            {employees?.length === 0 && <Empty msg="No staff added yet" />}
          </div>
        </Card>

        {canManage && (
          <Card title={editing ? `Edit — ${editing.name}` : "Add staff"}>
            <div className="space-y-3">
              {editing ? (
                <>
                  <Field label="Name"><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
                  <Field label="Phone"><Input value={editing.phone ?? ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></Field>
                  <Field label="Designation"><Input value={editing.designation ?? ""} onChange={(e) => setEditing({ ...editing, designation: e.target.value })} placeholder="Manager / Chef / Guard" /></Field>
                  <Field label={`Monthly salary (${cur()})`}><Input type="number" min={0} value={String(editing.salary)} onChange={(e) => setEditing({ ...editing, salary: Number(e.target.value) })} /></Field>
                  <div className="flex gap-2">
                    <Button onClick={saveEmployee} loading={busy}>Save</Button>
                    <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                  </div>
                </>
              ) : (
                <>
                  <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
                  <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="optional" /></Field>
                  <Field label="Designation"><Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="Manager / Chef / Guard" /></Field>
                  <Field label={`Monthly salary (${cur()})`}><Input type="number" min={0} value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} /></Field>
                  <Button onClick={saveEmployee} loading={busy} disabled={!form.name}>
                    <Plus className="inline h-4 w-4" /> Add staff
                  </Button>
                </>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-[10px] font-medium text-slate-400">{label}</div>
      <div className="text-sm font-bold text-slate-800">{value}</div>
    </div>
  );
}
