"use client";

import { useState } from "react";
import { api, money, dmy } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi, keys, useQueryClient } from "@/lib/query";
import { useOutbox } from "@/lib/outbox";
import { Badge, Button, Card, Empty, Field, Input, Modal, Select, Spinner, Stat, Td, Th, useToast } from "@/components/ui";
import { Table, Tabs } from "@/components/patterns";
import { ErrorState } from "@/components/error-state";
import { Plus, Trash2 } from "lucide-react";
import type { AgencyExpensePage, ExpenseHeadRow } from "@rh/shared";

/**
 * The agency's own expenses.
 *
 * Unlike the resort side, where a category is typed per entry, an agency
 * defines its heads first and files under them. That is what was asked for,
 * and it is what makes a head-by-head total possible at all — a free-text
 * category produces "Fuel", "fuel" and "Fuel " in the same report.
 */

const TABS = ["Entries", "Heads"] as const;

const monthStart = () => new Date().toISOString().slice(0, 8) + "01";
const monthEnd = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth() + 1, 1)).toISOString().slice(0, 10);
};

export default function AgencyExpensesPage() {
  const { role, can } = useAuth();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Entries");

  if (role !== "AGENT") return <Empty msg="Agents only" />;
  if (!can("agent.expenses.manage")) return <Empty msg="You do not have access to the agency's expenses" />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Expenses</h1>
        <p className="text-sm text-slate-500">What the agency spends, under the heads you keep.</p>
      </div>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === "Entries" ? <EntriesTab /> : <HeadsTab />}
    </div>
  );
}

function EntriesTab() {
  const qc = useQueryClient();
  const { push } = useToast();
  const [range, setRange] = useState({ from: monthStart(), to: monthEnd() });
  const [adding, setAdding] = useState(false);

  const { data: heads } = useApi<ExpenseHeadRow[]>(keys.agentHeads(), () =>
    api<ExpenseHeadRow[]>("/agent/expense-heads"),
  );
  const { data, isLoading, error, stale } = useApi<AgencyExpensePage>(keys.agentExpenses(range), () =>
    api<AgencyExpensePage>(`/agent/expenses?from=${range.from}&to=${range.to}`),
  );

  if (error) return <ErrorState error={error as Error} />;

  const reload = () => qc.invalidateQueries({ queryKey: ["agent"] });

  async function remove(id: number) {
    if (!window.confirm("Delete this entry?")) return;
    try {
      await api(`/agent/expenses/${id}`, { method: "DELETE" });
      reload();
    } catch (ex) {
      push((ex as Error).message, "err");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="From">
          <Input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        </Field>
        <Field label="To">
          <Input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </Field>
        <Button onClick={() => setAdding(true)} disabled={(heads ?? []).length === 0}>
          <Plus className="mr-1 h-4 w-4" /> Add an expense
        </Button>
      </div>

      {(heads ?? []).length === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Create a head first — office rent, fuel, salaries — then file entries under it.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total for this range" value={money(data?.summary.amount ?? 0)} />
        {(data?.summary.byHead ?? []).slice(0, 3).map((h) => (
          <Stat key={String(h.headId)} label={h.head} value={money(h.amount)} />
        ))}
      </div>

      <Card className="!p-0" title={`Entries (${data?.total ?? 0})`}>
        {isLoading && !data ? (
          <Spinner />
        ) : (data?.rows ?? []).length === 0 ? (
          <Empty msg="Nothing filed in this range" />
        ) : (
          <Table minWidth={640}>
            <thead className="border-b border-slate-100">
              <tr>
                <Th>Date</Th>
                <Th>Head</Th>
                <Th>Details</Th>
                <Th className="text-right">Amount</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(data?.rows ?? []).map((row) => (
                <tr key={row.id}>
                  <Td className="text-xs text-slate-500">{dmy(row.date)}</Td>
                  <Td className="font-medium">{row.head}</Td>
                  <Td className="text-sm text-slate-600">{row.details ?? "—"}</Td>
                  <Td className="text-right font-medium">{money(row.amount)}</Td>
                  <Td className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => remove(row.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-600" />
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {stale && (
          <div className="border-t border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
            Showing what was saved on this device {stale} — you appear to be offline.
          </div>
        )}
      </Card>

      {adding && (
        <AddExpense
          heads={(heads ?? []).filter((h) => h.active)}
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

function AddExpense({
  heads,
  onClose,
  onDone,
}: {
  heads: ExpenseHeadRow[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { push } = useToast();
  const { submit } = useOutbox();
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    headId: heads[0]?.id ?? 0,
    details: "",
    amount: "",
  });
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      // filing the day's costs from the road is exactly the case this is for:
      // the entry carries its own reference, so a replay is still one entry
      const { queued } = await submit({
        kind: "expense",
        label: `Expense ৳${form.amount}`,
        path: "/agent/expenses",
        body: { ...form, headId: Number(form.headId), amount: Number(form.amount) },
      });
      push(queued ? "Saved on this device — it will sync when you are back online" : "Expense added");
      onDone();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Add an expense">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date">
          <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </Field>
        <Field label="Head">
          <Select value={form.headId} onChange={(e) => setForm({ ...form, headId: Number(e.target.value) })}>
            {heads.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount">
          <Input
            type="number"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            autoFocus
          />
        </Field>
        <Field label="Details" hint="optional">
          <Input value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} />
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button loading={busy} onClick={save} disabled={!form.amount || Number(form.amount) <= 0}>
          Add
        </Button>
      </div>
    </Modal>
  );
}

function HeadsTab() {
  const qc = useQueryClient();
  const { push } = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const { data, isLoading, error } = useApi<ExpenseHeadRow[]>(keys.agentHeads(), () =>
    api<ExpenseHeadRow[]>("/agent/expense-heads"),
  );

  if (error) return <ErrorState error={error as Error} />;

  const reload = () => qc.invalidateQueries({ queryKey: ["agent"] });

  async function create() {
    setBusy(true);
    try {
      await api("/agent/expense-heads", { method: "POST", body: { name } });
      setName("");
      reload();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function retire(head: ExpenseHeadRow) {
    if (!window.confirm(`Remove "${head.name}"?`)) return;
    try {
      const result = await api<{ deactivated?: boolean }>(`/agent/expense-heads/${head.id}`, {
        method: "DELETE",
      });
      push(
        result.deactivated
          ? `"${head.name}" is retired — past entries keep it, so old reports still add up`
          : `"${head.name}" deleted`,
      );
      reload();
    } catch (ex) {
      push((ex as Error).message, "err");
    }
  }

  return (
    <div className="space-y-4">
      <Card className="!p-0" title="Heads">
        {isLoading && !data ? (
          <Spinner />
        ) : (data ?? []).length === 0 ? (
          <Empty msg="No heads yet — the list is yours to write" />
        ) : (
          <Table minWidth={520}>
            <thead className="border-b border-slate-100">
              <tr>
                <Th>Head</Th>
                <Th className="text-right">Entries</Th>
                <Th className="text-right">Total</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(data ?? []).map((h) => (
                <tr key={h.id}>
                  <Td className="font-medium">
                    {h.name} {!h.active && <Badge value="retired" />}
                  </Td>
                  <Td className="text-right text-slate-500">{h.entries}</Td>
                  <Td className="text-right font-medium">{money(h.amount)}</Td>
                  <Td className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => retire(h)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-600" />
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title="New head">
        <p className="mb-3 text-xs text-slate-500">
          Office rent, fuel, salaries, commission paid out — whatever you actually keep books on.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Office rent" />
          </Field>
          <Button loading={busy} onClick={create} disabled={!name.trim()}>
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>
      </Card>
    </div>
  );
}
