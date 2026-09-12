"use client";

import { useState } from "react";
import { api, money, dmy, API_URL, getToken } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi, keys, useQueryClient } from "@/lib/query";
import { useOutbox } from "@/lib/outbox";
import {
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  Stat,
  Td,
  Th,
  useToast,
} from "@/components/ui";
import { Table, Tabs } from "@/components/patterns";
import { ErrorState } from "@/components/error-state";
import { FileText, Plus, Printer, Send, Trash2 } from "lucide-react";
import type { SalesDocDetail, SalesDocRow, TourPackageRow } from "@rh/shared";

/**
 * Quotations and invoices.
 *
 * A quotation the client accepts becomes an invoice with one button, carrying
 * every line across unchanged — nobody retypes anything, which is where the
 * numbers stop matching.
 *
 * The client reads the document *in* the email. An attachment they have to
 * download is one they mostly do not, and then an agency cannot tell a lost
 * sale from an unopened PDF.
 */

const TABS = ["Quotations", "Invoices"] as const;

const STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  SENT: "bg-blue-50 text-blue-800",
  ACCEPTED: "bg-green-50 text-green-800",
  DECLINED: "bg-red-50 text-red-800",
  EXPIRED: "bg-amber-50 text-amber-900",
  PAID: "bg-green-100 text-green-900",
  VOID: "bg-slate-100 text-slate-400 line-through",
};

export default function SalesPage() {
  const { role, can } = useAuth();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Quotations");
  const [open, setOpen] = useState<number | "new" | null>(null);

  const kind = tab === "Quotations" ? "QUOTATION" : "INVOICE";
  const qc = useQueryClient();
  const { data, isLoading, error, stale } = useApi<SalesDocRow[]>(keys.agentSales(kind), () =>
    api<SalesDocRow[]>(`/agent/sales?kind=${kind}`),
  );

  if (role !== "AGENT") return <Empty msg="Agents only" />;
  if (!can("agent.sales.manage")) return <Empty msg="You do not have access to quotations and invoices" />;
  if (error) return <ErrorState error={error as Error} />;

  const reload = () => qc.invalidateQueries({ queryKey: ["agent"] });
  const outstanding = (data ?? []).reduce((s, d) => s + (d.status === "VOID" ? 0 : d.totals.due), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Quotations &amp; invoices</h1>
          <p className="text-sm text-slate-500">What you have quoted, what you have billed, and what is still due.</p>
        </div>
        <Button onClick={() => setOpen("new")}>
          <Plus className="mr-1 h-4 w-4" /> New {kind === "QUOTATION" ? "quotation" : "invoice"}
        </Button>
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={tab} value={String(data?.length ?? 0)} />
        <Stat
          label="Value"
          value={money((data ?? []).reduce((s, d) => s + (d.status === "VOID" ? 0 : d.totals.total), 0))}
        />
        <Stat label="Outstanding" value={money(outstanding)} tone={outstanding > 0 ? "amber" : undefined} />
      </div>

      <Card className="!p-0" title={tab}>
        {isLoading && !data ? (
          <Spinner />
        ) : (data ?? []).length === 0 ? (
          <Empty msg={`No ${tab.toLowerCase()} yet`} />
        ) : (
          <Table minWidth={760}>
            <thead className="border-b border-slate-100">
              <tr>
                <Th>Number</Th>
                <Th>Client</Th>
                <Th>Issued</Th>
                <Th>Status</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Due</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(data ?? []).map((d) => (
                <tr key={d.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen(d.id)}>
                  <Td className="font-mono text-xs font-semibold">{d.number}</Td>
                  <Td className="font-medium">{d.clientName}</Td>
                  <Td className="text-xs text-slate-500">
                    {dmy(d.issueDate)}
                    {d.validUntil && <div className="text-[11px]">valid to {dmy(d.validUntil)}</div>}
                  </Td>
                  <Td>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        STATUS_TONE[d.status] ?? "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {d.status.toLowerCase()}
                    </span>
                  </Td>
                  <Td className="text-right font-medium">{money(d.totals.total)}</Td>
                  <Td className={`text-right ${d.totals.due > 0 ? "font-medium text-amber-800" : "text-slate-400"}`}>
                    {money(d.totals.due)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {stale && (
          <div className="border-t border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
            Showing what was saved on this device {stale} — you appear to be offline. New documents will
            wait here until the signal returns; sending one needs a connection.
          </div>
        )}
      </Card>

      {open != null && (
        <DocEditor
          id={open}
          kind={kind}
          onClose={() => setOpen(null)}
          onDone={() => {
            setOpen(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

interface LineDraft {
  label: string;
  details: string;
  qty: number;
  unitPrice: number;
}

const BLANK: LineDraft = { label: "", details: "", qty: 1, unitPrice: 0 };

function DocEditor({
  id,
  kind,
  onClose,
  onDone,
}: {
  id: number | "new";
  kind: "QUOTATION" | "INVOICE";
  onClose: () => void;
  onDone: () => void;
}) {
  const { push } = useToast();
  const { submit } = useOutbox();
  const qc = useQueryClient();
  const isNew = id === "new";

  const { data: doc } = useApi<SalesDocDetail>(
    keys.agentSalesDoc(isNew ? 0 : (id as number)),
    () => api<SalesDocDetail>(`/agent/sales/${id}`),
    { enabled: !isNew },
  );
  const { data: packages } = useApi<TourPackageRow[]>(keys.agentPackages(), () =>
    api<TourPackageRow[]>("/agent/tours/packages?active=true"),
  );

  const [form, setForm] = useState({
    clientName: "",
    clientEmail: "",
    clientPhone: "",
    clientAddress: "",
    issueDate: new Date().toISOString().slice(0, 10),
    validUntil: "",
    discount: 0,
    taxRate: 0,
    notes: "",
    terms: "",
    packageId: "",
  });
  const [lines, setLines] = useState<LineDraft[]>([{ ...BLANK }]);
  const [loaded, setLoaded] = useState(isNew);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);

  if (doc && !loaded) {
    setForm({
      clientName: doc.clientName,
      clientEmail: doc.clientEmail ?? "",
      clientPhone: doc.clientPhone ?? "",
      clientAddress: doc.clientAddress ?? "",
      issueDate: doc.issueDate,
      validUntil: doc.validUntil ?? "",
      discount: doc.totals.discount,
      taxRate: doc.taxRate,
      notes: doc.notes ?? "",
      terms: doc.terms ?? "",
      packageId: doc.packageId ? String(doc.packageId) : "",
    });
    setLines(
      doc.items.length > 0
        ? doc.items.map((i) => ({
            label: i.label,
            details: i.details ?? "",
            qty: i.qty,
            unitPrice: i.unitPrice,
          }))
        : [{ ...BLANK }],
    );
    setLoaded(true);
  }

  /** The document is locked once money has been taken against these lines. */
  const locked = !!doc && doc.totals.paid > 0;
  const subtotal = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const taxable = Math.max(0, subtotal - form.discount);
  const tax = (taxable * form.taxRate) / 100;
  const total = taxable + tax;

  const setLine = (index: number, patch: Partial<LineDraft>) =>
    setLines((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  /** Picking a package fills the lines in; they stay editable afterwards. */
  async function usePackage(packageId: string) {
    setForm({ ...form, packageId });
    if (!packageId) return;
    try {
      const pkg = await api<{ items: { label: string; qty: number; unitPrice: number }[] }>(
        `/agent/tours/packages/${packageId}`,
      );
      setLines(
        pkg.items.map((i) => ({ label: i.label, details: "", qty: i.qty, unitPrice: i.unitPrice })),
      );
    } catch (ex) {
      push((ex as Error).message, "err");
    }
  }

  async function save() {
    setBusy(true);
    const body = {
      kind,
      ...form,
      packageId: form.packageId ? Number(form.packageId) : undefined,
      validUntil: form.validUntil || undefined,
      clientEmail: form.clientEmail || undefined,
      items: lines.filter((l) => l.label.trim()),
    };
    try {
      if (isNew) {
        const { queued } = await submit({
          kind: kind === "QUOTATION" ? "quotation" : "invoice",
          label: `${kind === "QUOTATION" ? "Quotation" : "Invoice"} for ${form.clientName}`,
          path: "/agent/sales",
          body,
        });
        push(queued ? "Saved on this device — it will sync when you are back online" : "Saved");
      } else {
        await api(`/agent/sales/${id}`, { method: "PATCH", body });
        push("Saved");
      }
      onDone();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (isNew) return;
    setSending(true);
    try {
      const result = await api<{ to: string }>(`/agent/sales/${id}/send`, { method: "POST", body: {} });
      push(`Sent to ${result.to}`);
      qc.invalidateQueries({ queryKey: ["agent"] });
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setSending(false);
    }
  }

  async function convert() {
    if (isNew) return;
    try {
      const invoice = await api<{ number: string }>(`/agent/sales/${id}/convert`, {
        method: "POST",
        body: {},
      });
      push(`Invoice ${invoice.number} raised`);
      onDone();
    } catch (ex) {
      push((ex as Error).message, "err");
    }
  }

  async function takeMoney() {
    if (isNew || !doc) return;
    const entered = window.prompt(`How much against ${doc.number}?`, String(doc.totals.due));
    if (!entered) return;
    try {
      await api(`/agent/sales/${id}/payments`, { method: "POST", body: { amount: Number(entered) } });
      push("Recorded");
      onDone();
    } catch (ex) {
      push((ex as Error).message, "err");
    }
  }

  async function remove() {
    if (isNew || !doc) return;
    if (!window.confirm(`Remove ${doc.number}?`)) return;
    try {
      const result = await api<{ voided?: boolean }>(`/agent/sales/${id}`, { method: "DELETE" });
      push(result.voided ? `${doc.number} voided — the client has already seen it` : "Deleted");
      onDone();
    } catch (ex) {
      push((ex as Error).message, "err");
    }
  }

  /**
   * The same markup the client is emailed, opened for printing.
   *
   * Fetched with the auth header and written into a blank window rather than
   * opened as a URL: a token in a query string ends up in browser history,
   * server logs and anything sitting in front of them.
   */
  async function print() {
    if (isNew) return;
    try {
      const res = await fetch(`${API_URL}/agent/sales/${id}/print`, {
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
      });
      if (!res.ok) throw new Error("Could not open the printable copy");
      const html = await res.text();
      const win = window.open("", "_blank", "noopener,width=820,height=1000");
      if (!win) {
        push("Your browser blocked the print window", "err");
        return;
      }
      win.document.write(html);
      win.document.close();
      win.focus();
      win.print();
    } catch (ex) {
      push((ex as Error).message, "err");
    }
  }

  const title = isNew
    ? `New ${kind === "QUOTATION" ? "quotation" : "invoice"}`
    : `${doc?.number ?? ""} · ${doc?.clientName ?? ""}`;

  return (
    <Modal open onClose={onClose} title={title} wide>
      {locked && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {money(doc!.totals.paid)} has been paid against this. The lines are a record of what was
          agreed, so they can no longer change — void it and raise a new one instead.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Client">
          <Input
            value={form.clientName}
            onChange={(e) => setForm({ ...form, clientName: e.target.value })}
            disabled={locked}
          />
        </Field>
        <Field label="Email" hint="where the document is sent">
          <Input
            value={form.clientEmail}
            onChange={(e) => setForm({ ...form, clientEmail: e.target.value })}
          />
        </Field>
        <Field label="Phone">
          <Input value={form.clientPhone} onChange={(e) => setForm({ ...form, clientPhone: e.target.value })} />
        </Field>
        <Field label="Address">
          <Input
            value={form.clientAddress}
            onChange={(e) => setForm({ ...form, clientAddress: e.target.value })}
          />
        </Field>
        <Field label="Issued">
          <Input
            type="date"
            value={form.issueDate}
            onChange={(e) => setForm({ ...form, issueDate: e.target.value })}
          />
        </Field>
        {kind === "QUOTATION" && (
          <Field label="Valid until">
            <Input
              type="date"
              value={form.validUntil}
              onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
            />
          </Field>
        )}
        {isNew && (
          <Field label="Start from a package" hint="fills the lines in; you can still change them">
            <Select value={form.packageId} onChange={(e) => usePackage(e.target.value)}>
              <option value="">Type the lines myself</option>
              {(packages ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {money(p.totals.price)}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between">
          <div className="text-xs font-medium text-slate-500">Lines</div>
          {!locked && (
            <Button size="sm" variant="ghost" onClick={() => setLines([...lines, { ...BLANK }])}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add a line
            </Button>
          )}
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[600px]">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <Th>Item</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Rate</Th>
                <Th className="text-right">Amount</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {lines.map((line, index) => (
                <tr key={index}>
                  <Td>
                    <Input
                      value={line.label}
                      onChange={(e) => setLine(index, { label: e.target.value })}
                      disabled={locked}
                    />
                  </Td>
                  <Td>
                    <Input
                      type="number"
                      className="!w-20 text-right"
                      value={line.qty}
                      onChange={(e) => setLine(index, { qty: Number(e.target.value) })}
                      disabled={locked}
                    />
                  </Td>
                  <Td>
                    <Input
                      type="number"
                      className="!w-28 text-right"
                      value={line.unitPrice}
                      onChange={(e) => setLine(index, { unitPrice: Number(e.target.value) })}
                      disabled={locked}
                    />
                  </Td>
                  <Td className="text-right text-sm font-medium">{money(line.qty * line.unitPrice)}</Td>
                  <Td className="text-right">
                    {!locked && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setLines(lines.filter((_, i) => i !== index))}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-600" />
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="space-y-3">
          <Field label="Discount">
            <Input
              type="number"
              value={form.discount}
              onChange={(e) => setForm({ ...form, discount: Number(e.target.value) })}
              disabled={locked}
            />
          </Field>
          <Field label="Tax %" hint="taken on the price after the discount">
            <Input
              type="number"
              value={form.taxRate}
              onChange={(e) => setForm({ ...form, taxRate: Number(e.target.value) })}
              disabled={locked}
            />
          </Field>
        </div>
        <div className="rounded-xl border border-slate-200 p-3 text-sm">
          <Row label="Subtotal" value={money(subtotal)} />
          {form.discount > 0 && <Row label="Discount" value={`− ${money(form.discount)}`} />}
          {form.taxRate > 0 && <Row label={`Tax (${form.taxRate}%)`} value={money(tax)} />}
          <Row label="Total" value={money(total)} strong />
          {doc && doc.totals.paid > 0 && (
            <>
              <Row label="Paid" value={`− ${money(doc.totals.paid)}`} />
              <Row label="Due" value={money(doc.totals.due)} strong />
            </>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Note to the client" hint="appears above the terms in the email">
          <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
        <Field label="Terms">
          <Input value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} />
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {!isNew && (
            <>
              <Button variant="ghost" onClick={print}>
                <Printer className="mr-1 h-4 w-4" /> Print
              </Button>
              <Button variant="ghost" loading={sending} onClick={send}>
                <Send className="mr-1 h-4 w-4" /> Email it
              </Button>
              {kind === "QUOTATION" && !doc?.convertedTo && (
                <Button variant="ghost" onClick={convert}>
                  <FileText className="mr-1 h-4 w-4" /> Make it an invoice
                </Button>
              )}
              {kind === "INVOICE" && doc && doc.totals.due > 0 && (
                <Button variant="ghost" onClick={takeMoney}>
                  Record a payment
                </Button>
              )}
              <Button variant="ghost" onClick={remove}>
                <Trash2 className="mr-1 h-4 w-4 text-red-600" /> Remove
              </Button>
            </>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button loading={busy} onClick={save} disabled={!form.clientName.trim()}>
            Save
          </Button>
        </div>
      </div>

      {doc?.convertedTo && (
        <p className="mt-3 text-xs text-slate-500">
          Invoiced as <b>{doc.convertedTo.number}</b>.
        </p>
      )}
      {doc?.convertedFrom && (
        <p className="mt-3 text-xs text-slate-500">
          From quotation <b>{doc.convertedFrom.number}</b>.
        </p>
      )}
    </Modal>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between py-1 ${strong ? "border-t border-slate-100 pt-2 font-semibold" : ""}`}>
      <span className={strong ? "text-slate-800" : "text-slate-500"}>{label}</span>
      <span className={strong ? "text-slate-900" : "text-slate-700"}>{value}</span>
    </div>
  );
}
