"use client";

import { useCallback, useEffect, useState } from "react";
import { api, bdt } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { Button, Card, Empty, Field, Input, Spinner, Stat, Td, Th, useToast } from "@/components/ui";

interface ExpenseRow {
  id: number;
  date: string;
  category: string;
  details: string | null;
  amount: number;
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Daily cashbook register — the sheet's expense tab, with a live day total. */
export default function ExpensesPage() {
  const { activeResort, isManagement } = useAuth();
  const t = useT();
  const { push } = useToast();
  const [date, setDate] = useState(iso(new Date()));
  const [rows, setRows] = useState<ExpenseRow[] | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [details, setDetails] = useState("");
  const [amount, setAmount] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const canManage = isManagement;

  const load = useCallback(async () => {
    if (!activeResort) return;
    setLoading(true);
    try {
      const data = await api<{ rows: ExpenseRow[]; total: number }>(
        `/resorts/${activeResort.id}/expenses?from=${date}&to=${iso(new Date(new Date(date).getTime() + 86400000))}`,
      );
      setRows(data.rows);
    } finally {
      setLoading(false);
    }
  }, [activeResort, date]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!activeResort) return;
    api<{ category: string }[]>(`/resorts/${activeResort.id}/expenses/categories`)
      .then((r) => setCategories(r.map((x) => x.category)))
      .catch(() => {});
  }, [activeResort]);

  function shift(days: number) {
    const d = new Date(date + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    setDate(iso(d));
  }

  async function add() {
    if (!activeResort || !category || !amount) return;
    setBusy(true);
    try {
      await api(`/resorts/${activeResort.id}/expenses`, {
        method: "POST",
        body: { date, category, details: details || undefined, amount: Number(amount) },
      });
      push(`${bdt(Number(amount))} — ${category}`);
      setCategory("");
      setDetails("");
      setAmount("");
      await load();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!window.confirm("Delete this entry?")) return;
    try {
      await api(`/expenses/${id}`, { method: "DELETE" });
      await load();
    } catch (ex) {
      push((ex as Error).message, "err");
    }
  }

  const dayTotal = (rows ?? []).reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => shift(-1)}>←</Button>
          <Button variant="ghost" size="sm" onClick={() => setDate(iso(new Date()))}>{t("ds.today")}</Button>
          <Button variant="ghost" size="sm" onClick={() => shift(1)}>→</Button>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="!w-40" />
        </div>
        <div className="text-sm font-semibold text-slate-600">
          {new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
            weekday: "long", day: "numeric", month: "long", year: "numeric",
          })}
        </div>
      </div>

      {/* live day total — the sheet's "Daily Total Expense" column */}
      <div className="grid grid-cols-2 gap-4">
        <Stat label="দিনের মোট খরচ / Day total" value={bdt(dayTotal)} tone="red" sub={`${(rows ?? []).length} entries`} />
      </div>

      {/* entry row */}
      {canManage && (
        <Card title="নতুন খরচ / New entry">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="খরচের খাত / Category">
              <>
                <Input
                  list="expense-categories"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="সবজি, নাস্তা, মুদি দোকান…"
                  className="!w-56"
                />
                <datalist id="expense-categories">
                  {categories.map((c) => <option key={c} value={c} />)}
                </datalist>
              </>
            </Field>
            <Field label="বিবরণ / Details">
              <Input value={details} onChange={(e) => setDetails(e.target.value)} className="!w-48" />
            </Field>
            <Field label="৳">
              <Input
                type="number"
                min={1}
                value={amount || ""}
                onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
                className="!w-28"
                onKeyDown={(e) => e.key === "Enter" && add()}
              />
            </Field>
            <Button onClick={add} loading={busy} disabled={!category || !amount}>Add</Button>
          </div>
        </Card>
      )}

      {/* register */}
      <Card title={`${date} — register`} className="!p-0">
        {loading || rows === null ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <Empty msg="No entries for this day" />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100">
              <tr><Th>খাত / Category</Th><Th>বিবরণ / Details</Th><Th className="text-right">৳</Th>{canManage && <Th />}</tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td className="font-medium">{r.category}</Td>
                  <Td className="text-xs text-slate-500">{r.details ?? "—"}</Td>
                  <Td className="text-right font-semibold text-red-700">{bdt(r.amount)}</Td>
                  {canManage && (
                    <Td className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => remove(r.id)}>✕</Button>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
