"use client";

import { useMemo, useState } from "react";
import { api, money } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi, keys, useQueryClient } from "@/lib/query";
import { useOutbox } from "@/lib/outbox";
import { Badge, Button, Card, Empty, Field, Input, Modal, Spinner, Td, Th, useToast } from "@/components/ui";
import { Table, Tabs } from "@/components/patterns";
import { ErrorState } from "@/components/error-state";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import type { TourCategoryNode, TourPackageDetail, TourPackageRow } from "@rh/shared";

/**
 * Tour packages.
 *
 * An agency does not sell rooms alone — it sells a trip, and every agency buys
 * a different list of things to make one. So the tree here starts empty and
 * the agency writes it: Transport, then Bus under it, then AC under that, to
 * whatever depth the way they buy actually needs.
 *
 * A package is built by picking leaves off that tree and pricing them. Cost
 * sits beside price on every line, because an agency that cannot see its own
 * margin while quoting finds it out after the trip.
 */

const TABS = ["Packages", "What a tour is made of"] as const;

export default function ToursPage() {
  const { role, can } = useAuth();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Packages");

  if (role !== "AGENT") return <Empty msg="Agents only" />;
  if (!can("agent.tours.manage")) return <Empty msg="You do not have access to tour packages" />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Tours</h1>
        <p className="text-sm text-slate-500">
          What your trips are made of, and the packages you sell built from it.
        </p>
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === "Packages" ? <PackagesTab /> : <TreeTab />}
    </div>
  );
}

// ───────────────────────────── the tree ─────────────────────────────

function TreeTab() {
  const qc = useQueryClient();
  const { push } = useToast();
  const { data, isLoading, error, stale } = useApi<TourCategoryNode[]>(keys.agentTours(), () =>
    api<TourCategoryNode[]>("/agent/tours/categories"),
  );
  const [adding, setAdding] = useState<{ parentId: number | null; parentName: string } | null>(null);

  if (error) return <ErrorState error={error as Error} />;
  if (isLoading && !data) return <Spinner />;

  const reload = () => qc.invalidateQueries({ queryKey: keys.agentTours() });

  async function remove(node: TourCategoryNode) {
    if (!window.confirm(`Delete "${node.name}"?`)) return;
    try {
      await api(`/agent/tours/categories/${node.id}`, { method: "DELETE" });
      reload();
    } catch (ex) {
      push((ex as Error).message, "err");
    }
  }

  return (
    <div className="space-y-4">
      <Card
        className="!p-0"
        title="Your headings"
        action={
          <Button size="sm" onClick={() => setAdding({ parentId: null, parentName: "the top level" })}>
            <Plus className="mr-1 h-4 w-4" /> Add a heading
          </Button>
        }
      >
        {(data ?? []).length === 0 ? (
          <Empty msg="Nothing yet — start with a heading like Transport or Food" />
        ) : (
          <div className="divide-y divide-slate-50">
            {(data ?? []).map((node) => (
              <Branch key={node.id} node={node} depth={0} onAdd={setAdding} onRemove={remove} />
            ))}
          </div>
        )}
        {stale && (
          <div className="border-t border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
            Showing what was saved on this device {stale} — you appear to be offline.
          </div>
        )}
      </Card>

      <p className="text-xs text-slate-500">
        Nest these as deeply as you buy: Transport → Bus → AC. Nothing is deleted while something
        sits under it, or while a package still uses it.
      </p>

      {adding && (
        <AddCategory
          parentId={adding.parentId}
          parentName={adding.parentName}
          onClose={() => setAdding(null)}
          onDone={() => {
            setAdding(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function Branch({
  node,
  depth,
  onAdd,
  onRemove,
}: {
  node: TourCategoryNode;
  depth: number;
  onAdd: (v: { parentId: number; parentName: string }) => void;
  onRemove: (n: TourCategoryNode) => void;
}) {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50"
        style={{ paddingLeft: 16 + depth * 20 }}
      >
        <button
          onClick={() => setOpen((v) => !v)}
          className={`text-slate-400 ${hasChildren ? "" : "invisible"}`}
          aria-label={open ? "Collapse" : "Expand"}
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <span className="flex-1 text-sm font-medium text-slate-800">{node.name}</span>
        {!node.active && <Badge value="retired" />}
        <Button size="sm" variant="ghost" onClick={() => onAdd({ parentId: node.id, parentName: node.name })}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onRemove(node)}>
          <Trash2 className="h-3.5 w-3.5 text-red-600" />
        </Button>
      </div>
      {open &&
        node.children.map((child) => (
          <Branch key={child.id} node={child} depth={depth + 1} onAdd={onAdd} onRemove={onRemove} />
        ))}
    </div>
  );
}

function AddCategory({
  parentId,
  parentName,
  onClose,
  onDone,
}: {
  parentId: number | null;
  parentName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { push } = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api("/agent/tours/categories", { method: "POST", body: { name, parentId } });
      onDone();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Add under ${parentName}`}>
      <Field label="Name" hint="Transport, Bus, AC — whatever you actually buy">
        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button loading={busy} onClick={save} disabled={!name.trim()}>
          Add
        </Button>
      </div>
    </Modal>
  );
}

// ───────────────────────────── packages ─────────────────────────────

function PackagesTab() {
  const qc = useQueryClient();
  const { push } = useToast();
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const { data, isLoading, error, stale } = useApi<TourPackageRow[]>(keys.agentPackages(), () =>
    api<TourPackageRow[]>("/agent/tours/packages"),
  );

  if (error) return <ErrorState error={error as Error} />;
  if (isLoading && !data) return <Spinner />;

  const reload = () => qc.invalidateQueries({ queryKey: ["agent"] });

  async function remove(id: number) {
    if (!window.confirm("Delete this package?")) return;
    try {
      await api(`/agent/tours/packages/${id}`, { method: "DELETE" });
      reload();
    } catch (ex) {
      push((ex as Error).message, "err");
    }
  }

  return (
    <div className="space-y-4">
      <Card
        className="!p-0"
        title={`Packages (${data?.length ?? 0})`}
        action={
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="mr-1 h-4 w-4" /> New package
          </Button>
        }
      >
        {(data ?? []).length === 0 ? (
          <Empty msg="No packages yet" />
        ) : (
          <Table minWidth={760}>
            <thead className="border-b border-slate-100">
              <tr>
                <Th>Package</Th>
                <Th>Trip</Th>
                <Th className="text-right">Cost</Th>
                <Th className="text-right">Price</Th>
                <Th className="text-right">Margin</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(data ?? []).map((p) => (
                <tr key={p.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setEditing(p.id)}>
                  <Td className="font-medium">
                    {p.name}
                    {!p.active && <span className="ml-2"><Badge value="inactive" /></span>}
                    <div className="text-xs text-slate-500">{p.lines} line{p.lines === 1 ? "" : "s"}</div>
                  </Td>
                  <Td className="text-xs text-slate-500">
                    {p.days}d / {p.nights}n · {p.pax} pax
                  </Td>
                  <Td className="text-right text-slate-500">{money(p.totals.cost)}</Td>
                  <Td className="text-right font-medium">{money(p.totals.price)}</Td>
                  <Td className={`text-right font-medium ${p.totals.margin < 0 ? "text-red-700" : "text-green-700"}`}>
                    {money(p.totals.margin)}
                  </Td>
                  <Td className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(p.id);
                      }}
                    >
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

      {editing != null && (
        <PackageEditor
          id={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

interface LineDraft {
  categoryId: number | null;
  label: string;
  qty: number;
  unitCost: number;
  unitPrice: number;
}

const BLANK_LINE: LineDraft = { categoryId: null, label: "", qty: 1, unitCost: 0, unitPrice: 0 };

function PackageEditor({
  id,
  onClose,
  onDone,
}: {
  id: number | "new";
  onClose: () => void;
  onDone: () => void;
}) {
  const { push } = useToast();
  const { submit } = useOutbox();
  const isNew = id === "new";
  const { data: tree } = useApi<TourCategoryNode[]>(keys.agentTours(), () =>
    api<TourCategoryNode[]>("/agent/tours/categories"),
  );
  const { data: existing } = useApi<TourPackageDetail>(
    keys.agentPackage(isNew ? 0 : (id as number)),
    () => api<TourPackageDetail>(`/agent/tours/packages/${id}`),
    { enabled: !isNew },
  );

  const [form, setForm] = useState({ name: "", summary: "", days: 1, nights: 0, pax: 1 });
  const [lines, setLines] = useState<LineDraft[]>([{ ...BLANK_LINE }]);
  const [loaded, setLoaded] = useState(isNew);
  const [busy, setBusy] = useState(false);

  if (existing && !loaded) {
    setForm({
      name: existing.name,
      summary: existing.summary ?? "",
      days: existing.days,
      nights: existing.nights,
      pax: existing.pax,
    });
    setLines(
      existing.items.length > 0
        ? existing.items.map((i) => ({
            categoryId: i.categoryId,
            label: i.label,
            qty: i.qty,
            unitCost: i.unitCost,
            unitPrice: i.unitPrice,
          }))
        : [{ ...BLANK_LINE }],
    );
    setLoaded(true);
  }

  /** Every leaf, with its path, so a line says "Transport › Bus › AC". */
  const options = useMemo(() => flatten(tree ?? []), [tree]);

  const totals = lines.reduce(
    (acc, l) => ({
      cost: acc.cost + l.qty * l.unitCost,
      price: acc.price + l.qty * l.unitPrice,
    }),
    { cost: 0, price: 0 },
  );

  const setLine = (index: number, patch: Partial<LineDraft>) =>
    setLines((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  async function save() {
    setBusy(true);
    const body = {
      ...form,
      items: lines.filter((l) => l.label.trim()),
    };
    try {
      if (isNew) {
        // an agency writing up a tour on the bus back should not lose it for
        // want of a signal; the write carries its own identity and can wait
        const { queued } = await submit({
          kind: "package",
          label: `Tour package "${form.name}"`,
          path: "/agent/tours/packages",
          body,
        });
        push(queued ? "Saved on this device — it will sync when you are back online" : "Package saved");
      } else {
        await api(`/agent/tours/packages/${id}`, { method: "PATCH", body });
        push("Package saved");
      }
      onDone();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={isNew ? "New package" : form.name || "Package"} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Summary" hint="one line the client sees">
          <Input value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
        </Field>
        <div className="grid grid-cols-3 gap-2 sm:col-span-2">
          <Field label="Days">
            <Input
              type="number"
              value={form.days}
              onChange={(e) => setForm({ ...form, days: Number(e.target.value) })}
            />
          </Field>
          <Field label="Nights">
            <Input
              type="number"
              value={form.nights}
              onChange={(e) => setForm({ ...form, nights: Number(e.target.value) })}
            />
          </Field>
          <Field label="Covers (pax)">
            <Input
              type="number"
              value={form.pax}
              onChange={(e) => setForm({ ...form, pax: Number(e.target.value) })}
            />
          </Field>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between">
          <div className="text-xs font-medium text-slate-500">What is in it</div>
          <Button size="sm" variant="ghost" onClick={() => setLines([...lines, { ...BLANK_LINE }])}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add a line
          </Button>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[680px]">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <Th>Category</Th>
                <Th>Line</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Cost</Th>
                <Th className="text-right">Price</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {lines.map((line, index) => (
                <tr key={index}>
                  <Td>
                    <select
                      className="w-40 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                      value={line.categoryId ?? ""}
                      onChange={(e) =>
                        setLine(index, { categoryId: e.target.value ? Number(e.target.value) : null })
                      }
                    >
                      <option value="">—</option>
                      {options.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.path}
                        </option>
                      ))}
                    </select>
                  </Td>
                  <Td>
                    <Input value={line.label} onChange={(e) => setLine(index, { label: e.target.value })} />
                  </Td>
                  <Td>
                    <Input
                      type="number"
                      className="!w-20 text-right"
                      value={line.qty}
                      onChange={(e) => setLine(index, { qty: Number(e.target.value) })}
                    />
                  </Td>
                  <Td>
                    <Input
                      type="number"
                      className="!w-24 text-right"
                      value={line.unitCost}
                      onChange={(e) => setLine(index, { unitCost: Number(e.target.value) })}
                    />
                  </Td>
                  <Td>
                    <Input
                      type="number"
                      className="!w-24 text-right"
                      value={line.unitPrice}
                      onChange={(e) => setLine(index, { unitPrice: Number(e.target.value) })}
                    />
                  </Td>
                  <Td className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setLines(lines.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-600" />
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline justify-end gap-x-6 gap-y-1 text-sm">
        <span className="text-slate-500">
          Costs you <b className="text-slate-800">{money(totals.cost)}</b>
        </span>
        <span className="text-slate-500">
          Client pays <b className="text-slate-800">{money(totals.price)}</b>
        </span>
        <span className={totals.price - totals.cost < 0 ? "text-red-700" : "text-green-700"}>
          Margin <b>{money(totals.price - totals.cost)}</b>
        </span>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button loading={busy} onClick={save} disabled={!form.name.trim()}>
          Save package
        </Button>
      </div>
    </Modal>
  );
}

/** Every node of the tree as "Transport › Bus › AC", so a line names its place. */
function flatten(nodes: TourCategoryNode[], prefix = ""): { id: number; path: string }[] {
  return nodes.flatMap((n) => {
    const path = prefix ? `${prefix} › ${n.name}` : n.name;
    return [{ id: n.id, path }, ...flatten(n.children, path)];
  });
}
