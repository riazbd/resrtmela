"use client";

import { useCallback, useEffect, useState } from "react";
import { api, bdt, dmy, type BookingRow } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Badge, Button, Card, Empty, Field, Input, Modal, Select, Spinner, Stat, Td, Th, useToast } from "@/components/ui";

interface DuesResponse {
  total: number;
  count: number;
  rows: (BookingRow & { state: string })[];
}

export default function PaymentsPage() {
  const { activeResort, isStaff } = useAuth();
  const { push } = useToast();
  const [data, setData] = useState<DuesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [payFor, setPayFor] = useState<DuesResponse["rows"][number] | null>(null);

  const load = useCallback(async () => {
    if (!activeResort) return;
    setLoading(true);
    try {
      setData(await api<DuesResponse>(`/resorts/${activeResort.id}/dues`));
    } finally {
      setLoading(false);
    }
  }, [activeResort]);

  useEffect(() => {
    if (isStaff) void load();
  }, [load, isStaff]);

  if (!isStaff) return <Empty msg="Staff only" />;
  if (loading || !data) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Stat label="Total outstanding" value={bdt(data.total)} tone="red" />
        <Stat label="Bookings with dues" value={String(data.count)} tone="amber" />
      </div>

      <Card className="!p-0" title="Outstanding dues">
        {data.rows.length === 0 ? (
          <Empty msg="No outstanding dues 🎉" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="border-b border-slate-100">
                <tr><Th>Code</Th><Th>Guest</Th><Th>Stay</Th><Th>Status</Th><Th className="text-right">Rent</Th><Th className="text-right">Paid</Th><Th className="text-right">Due</Th><Th /></tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data.rows.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50/50">
                    <Td className="font-medium text-brand-700">{b.code}</Td>
                    <Td>
                      <div>{b.guest?.fullName}</div>
                      <div className="text-[11px] text-slate-400">{b.guest?.phone}</div>
                    </Td>
                    <Td className="text-xs">{dmy(b.checkIn)} → {dmy(b.checkOut)}</Td>
                    <Td><Badge value={b.state} /></Td>
                    <Td className="text-right">{bdt(b.rent)}</Td>
                    <Td className="text-right text-green-700">{bdt(b.paid)}</Td>
                    <Td className="text-right font-bold text-red-700">{bdt(b.due)}</Td>
                    <Td className="text-right"><Button size="sm" variant="ghost" onClick={() => setPayFor(b)}>Collect</Button></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <CollectModal row={payFor} onClose={() => setPayFor(null)} onDone={() => void load()} />
    </div>
  );
}

function CollectModal({ row, onClose, onDone }: {
  row: DuesResponse["rows"][number] | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { push } = useToast();
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState("CASH");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (row) setAmount(row.due);
  }, [row]);

  async function submit() {
    if (!row) return;
    setBusy(true);
    try {
      await api(`/bookings/${row.id}/payments`, { method: "POST", body: { amount, method } });
      push(`Collected ${bdt(amount)} for ${row.code}`);
      onDone();
      onClose();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!row} onClose={onClose} title={`Collect payment — ${row?.code ?? ""}`}>
      {row && (
        <div className="space-y-3">
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            {row.guest?.fullName} · due <b className="text-red-700">{bdt(row.due)}</b>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (৳)"><Input type="number" min={1} value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} /></Field>
            <Field label="Method">
              <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                {["CASH", "BKASH", "NAGAD", "CARD", "BANK"].map((m) => <option key={m}>{m}</option>)}
              </Select>
            </Field>
          </div>
          <div className="flex justify-end"><Button onClick={submit} loading={busy} disabled={amount <= 0}>Record payment</Button></div>
        </div>
      )}
    </Modal>
  );
}
