"use client";

import { useEffect, useState } from "react";
import { client, money, dmy, cur, type DuesReport } from "@/lib/api";
import { useApi, keys, useMutation, useQueryClient } from "@/lib/query";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { Badge, Button, Card, Empty, Field, Input, Modal, Select, Spinner, Stat, Td, Th, useToast } from "@/components/ui";
import { ErrorState, Skeleton } from "@/components/error-state";

type DueRow = DuesReport["rows"][number];

export default function PaymentsPage() {
  const { activeResort, isStaff } = useAuth();
  const { push } = useToast();
  const t = useT();
  const qc = useQueryClient();
  const [payFor, setPayFor] = useState<DueRow | null>(null);

  const { data, isPending, error } = useApi(
    keys.dues(activeResort?.id),
    () => client.dues(activeResort!.id),
    { enabled: isStaff && !!activeResort },
  );

  /**
   * Collecting money changes the dues list, the day sheet's outstanding strip
   * and the booking itself. Naming them here is why those screens are correct
   * the moment the user walks to them, instead of showing yesterday's number
   * until something happens to refetch.
   */
  function afterPayment() {
    void qc.invalidateQueries({ queryKey: keys.dues(activeResort?.id) });
    void qc.invalidateQueries({ queryKey: ["day-sheet", activeResort?.id] });
    void qc.invalidateQueries({ queryKey: ["today", activeResort?.id] });
    void qc.invalidateQueries({ queryKey: ["bookings", activeResort?.id] });
  }

  if (!isStaff) return <Empty msg={t("c.staffOnly")} />;
  if (error) return <ErrorState error={error} />;
  if (isPending || !data) return <Skeleton rows={6} />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Stat label={t("pay.outstanding")} value={money(data.total)} tone="red" />
        <Stat label={t("pay.withDues")} value={String(data.count)} tone="amber" />
      </div>

      <Card className="!p-0" title={t("pay.title")}>
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
                    <Td className="text-right">{money(b.rent)}</Td>
                    <Td className="text-right text-green-700">{money(b.paid)}</Td>
                    <Td className="text-right font-bold text-red-700">{money(b.due)}</Td>
                    <Td className="text-right"><Button size="sm" variant="ghost" onClick={() => setPayFor(b)}>Collect</Button></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <CollectModal row={payFor} onClose={() => setPayFor(null)} onDone={afterPayment} />
    </div>
  );
}

function CollectModal({ row, onClose, onDone }: {
  row: DueRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { push } = useToast();
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState("CASH");

  useEffect(() => {
    if (row) setAmount(row.due);
  }, [row]);

  // A payment is never retried on its own — the clerk pressed the button once,
  // and a second attempt would be a second receipt in the guest's hand.
  const collect = useMutation({
    mutationFn: () => client.bookings.pay(row!.id, { amount, method }),
    onSuccess: () => {
      push(`Collected ${money(amount)} for ${row!.code}`);
      onDone();
      onClose();
    },
    onError: (ex: Error) => push(ex.message, "err"),
  });

  return (
    <Modal open={!!row} onClose={onClose} title={`Collect payment — ${row?.code ?? ""}`}>
      {row && (
        <div className="space-y-3">
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            {row.guest?.fullName} · due <b className="text-red-700">{money(row.due)}</b>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Amount (${cur()})`}><Input type="number" min={1} value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} /></Field>
            <Field label="Method">
              <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                {["CASH", "BKASH", "NAGAD", "CARD", "BANK"].map((m) => <option key={m}>{m}</option>)}
              </Select>
            </Field>
          </div>
          <div className="flex justify-end"><Button onClick={() => collect.mutate()} loading={collect.isPending} disabled={amount <= 0}>Record payment</Button></div>
        </div>
      )}
    </Modal>
  );
}
