"use client";

import { useState } from "react";
import { client, money, cur } from "@/lib/api";
import { useApi, keys, useMutation, useQueryClient } from "@/lib/query";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { Button, Card, Empty, Field, Input, Select, Spinner, Stat, Td, Th, useToast } from "@/components/ui";
import { ErrorState, Skeleton } from "@/components/error-state";
import { DateNav } from "@/components/patterns";

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Daily cashbook register — the sheet's expense tab, with a live day total. */
export default function ExpensesPage() {
  const { activeResort, isManagement } = useAuth();
  const t = useT();
  const { push } = useToast();
  const [date, setDate] = useState(iso(new Date()));
  const [category, setCategory] = useState("");
  const [details, setDetails] = useState("");
  const [amount, setAmount] = useState<number | "">("");
  const [scope, setScope] = useState("RESORT");
  const qc = useQueryClient();

  const canManage = isManagement;
  const to = iso(new Date(new Date(date).getTime() + 86400000));

  const listQ = useApi(
    keys.expenses(activeResort?.id, date),
    () => client.expenses.list(activeResort!.id, { from: date, to }),
    { enabled: !!activeResort, placeholderData: (prev) => prev },
  );
  // the category list barely changes; an hour of staleness saves a request on
  // every day the user pages through
  const categoriesQ = useApi(
    keys.expenseCategories(activeResort?.id),
    () => client.expenses.categories(activeResort!.id) as unknown as Promise<{ category: string }[]>,
    { enabled: !!activeResort, staleTime: 3_600_000 },
  );

  const rows = listQ.data?.rows ?? null;
  // the day total is aggregated server-side over every matching row, so a day
  // with more entries than one page still shows the true figure
  const dayTotal = listQ.data?.summary.amount ?? 0;
  const entryCount = listQ.data?.total ?? 0;
  const categories = (categoriesQ.data ?? []).map((x) => x.category);
  const loading = listQ.isPending;

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["expenses", activeResort?.id] });
    void qc.invalidateQueries({ queryKey: ["expense-categories", activeResort?.id] });
    // the day sheet's expense figure comes from the same entries
    void qc.invalidateQueries({ queryKey: ["day-sheet", activeResort?.id] });
  };

  const addExpense = useMutation({
    mutationFn: () =>
      client.expenses.create(activeResort!.id, {
        date,
        category,
        details: details || undefined,
        amount: Number(amount),
        scope,
      }),
    onSuccess: () => {
      push(`${money(Number(amount))} — ${category}`);
      setCategory("");
      setDetails("");
      setAmount("");
      refresh();
    },
    onError: (ex: Error) => push(ex.message, "err"),
  });
  const busy = addExpense.isPending;

  function add() {
    if (!activeResort || !category || !amount) return;
    addExpense.mutate();
  }

  const removeExpense = useMutation({
    mutationFn: (id: number) => client.expenses.remove(id),
    onSuccess: refresh,
    onError: (ex: Error) => push(ex.message, "err"),
  });

  function remove(id: number) {
    if (!window.confirm("Delete this entry?")) return;
    removeExpense.mutate(id);
  }


  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateNav value={date} onChange={setDate} todayLabel={t("ds.today")} />
        <div className="text-sm font-semibold text-slate-600">
          {new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
            weekday: "long", day: "numeric", month: "long", year: "numeric",
          })}
        </div>
      </div>

      {/* live day total — the sheet's "Daily Total Expense" column */}
      <div className="grid grid-cols-2 gap-4">
        <Stat label="দিনের মোট খরচ / Day total" value={money(dayTotal)} tone="red" sub={`${entryCount} entries`} />
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
            <Field label={cur()}>
              <Input
                type="number"
                min={1}
                value={amount || ""}
                onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
                className="!w-28"
                onKeyDown={(e) => e.key === "Enter" && add()}
              />
            </Field>
            <Field label="Scope">
              <Select value={scope} onChange={(e) => setScope(e.target.value)} className="!w-36">
                <option value="RESORT">Resort</option>
                <option value="RESTAURANT">Restaurant</option>
              </Select>
            </Field>
            <Button onClick={add} loading={busy} disabled={!category || !amount}>Add</Button>
          </div>
        </Card>
      )}

      {/* register */}
      <Card title={`${date} — register`} className="!p-0">
        {listQ.error ? (
          <ErrorState error={listQ.error} />
        ) : loading || rows === null ? (
          <Skeleton rows={4} />
        ) : rows.length === 0 ? (
          <Empty msg={t("ex.none")} />
        ) : (
          <div className="overflow-x-auto"><table className="w-full">
            <thead className="border-b border-slate-100">
              <tr><Th>{t("ex.category")}</Th><Th>{t("ex.details")}</Th><Th className="text-right">{cur()}</Th>{canManage && <Th />}</tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td className="font-medium">{r.category}</Td>
                  <Td className="text-xs text-slate-500">{r.details ?? "—"}</Td>
                  <Td className="text-right font-semibold text-red-700">{money(r.amount)}</Td>
                  {canManage && (
                    <Td className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => remove(r.id)}>✕</Button>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}
