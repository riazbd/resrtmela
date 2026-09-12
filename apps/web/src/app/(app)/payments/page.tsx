"use client";

import { useEffect, useState } from "react";
import { Table } from "@/components/patterns";
import { client, money, dmy, cur, type DuesReport } from "@/lib/api";
import { useApi, keys, useMutation, useQueryClient } from "@/lib/query";
import { useOutbox } from "@/lib/outbox";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { Badge, Button, Card, Empty, Field, Input, Modal, Select, Spinner, Stat, Td, Th, useToast } from "@/components/ui";
import { ErrorState, Skeleton } from "@/components/error-state";
import { usePaymentMethods } from "@/lib/resort-options";

type DueRow = DuesReport["rows"][number];

/**
 * Whose debt this screen is showing.
 *
 * A guest's balance is collected at the desk on the morning they leave. An
 * agency's is a trade account settled between two businesses. They were one
 * table and one red total, so the front desk read a guest's name beside money
 * that guest does not owe, and "what is outstanding" was a number nobody could
 * act on. Everything is still one click away — the split is a lens, not a
 * filter that hides money.
 */
const WHO = ["Everyone", "Guests", "Agencies"] as const;
type Who = (typeof WHO)[number];

export default function PaymentsPage() {
  const { activeResort, isStaff } = useAuth();
  const { push } = useToast();
  const t = useT();
  const qc = useQueryClient();
  const [payFor, setPayFor] = useState<DueRow | null>(null);
  const [who, setWho] = useState<Who>("Everyone");

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

  const rows =
    who === "Guests"
      ? data.rows.filter((r) => r.agent === null)
      : who === "Agencies"
        ? data.rows.filter((r) => r.agent !== null)
        : data.rows;

  const shown =
    who === "Guests"
      ? { total: data.guestTotal, count: data.guestCount }
      : who === "Agencies"
        ? { total: data.agencyTotal, count: data.agencyCount }
        : { total: data.total, count: data.count };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label={t("pay.outstanding")} value={money(data.total)} tone="red" />
        <Stat label={t("pay.withDues")} value={String(data.count)} tone="amber" />
        {/* the same money, split by who has to be asked for it */}
        <Stat label="Due from guests" value={money(data.guestTotal)} />
        <Stat label="Due from agencies" value={money(data.agencyTotal)} />
      </div>

      <div className="flex overflow-hidden rounded-lg border border-slate-200">
        {WHO.map((w) => (
          <button
            key={w}
            onClick={() => setWho(w)}
            className={`px-3 py-1.5 text-xs font-semibold transition ${
              who === w ? "bg-brand-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
            }`}
          >
            {w}
            <span className={`ml-1.5 ${who === w ? "opacity-80" : "text-slate-400"}`}>
              {w === "Guests" ? data.guestCount : w === "Agencies" ? data.agencyCount : data.count}
            </span>
          </button>
        ))}
      </div>

      {/**
       * Who to ring, and for how much. Four bookings from one agency are one
       * phone call, and this is the only place on the screen that says so.
       */}
      {who === "Agencies" && data.byAgency.length > 0 && (
        <Card className="!p-0" title="Due from each agency">
          <div className="divide-y divide-slate-50">
            {data.byAgency.map((a) => (
              <div
                key={`${a.accountId ?? a.agency}`}
                className="flex items-center justify-between px-4 py-2 text-sm"
              >
                <span className="font-medium text-slate-700">{a.agency}</span>
                <span className="text-slate-500">
                  {a.bookings} booking{a.bookings === 1 ? "" : "s"}
                  <b className="ml-3 text-red-700">{money(a.due)}</b>
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="!p-0" title={`${t("pay.title")} — ${money(shown.total)} across ${shown.count}`}>
        {rows.length === 0 ? (
          <Empty
            msg={
              who === "Agencies"
                ? "Nothing due from any agency 🎉"
                : who === "Guests"
                  ? "Nothing due from any guest 🎉"
                  : "No outstanding dues 🎉"
            }
          />
        ) : (
          <Table minWidth={820}>
              <thead className="border-b border-slate-100">
                <tr><Th>Code</Th><Th>Guest</Th><Th>Due from</Th><Th>Stay</Th><Th>Status</Th><Th className="text-right">Rent</Th><Th className="text-right">Paid</Th><Th className="text-right">Due</Th><Th /></tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50/50">
                    <Td className="font-medium text-brand-700">{b.code}</Td>
                    <Td>
                      <div>{b.guest?.fullName}</div>
                      <div className="text-[11px] text-slate-400">{b.guest?.phone}</div>
                    </Td>
                    {/* the desk asks the guest; the office settles with the agency */}
                    <Td>
                      {b.agent ? (
                        <>
                          <div className="text-sm text-slate-700">{b.agent.agency}</div>
                          <div className="text-[11px] text-slate-400">sold by {b.agent.name}</div>
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">The guest</span>
                      )}
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
            </Table>
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
  const methodChoices = usePaymentMethods(useAuth().activeResort?.id);
  const { push } = useToast();
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState("CASH");

  useEffect(() => {
    if (row) setAmount(row.due);
  }, [row]);

  const { submit } = useOutbox();

  /**
   * A payment is never retried on its own — the clerk pressed the button once,
   * and a second attempt would be a second receipt in the guest's hand. When
   * the network is down it goes to the outbox instead, carrying a reference
   * the server treats as its identity, so the replay cannot double-charge.
   */
  const collect = useMutation({
    mutationFn: () =>
      submit({
        kind: "payment",
        label: `${money(amount)} · ${row!.code}`,
        path: `/bookings/${row!.id}/payments`,
        body: { amount, method },
      }),
    onSuccess: ({ queued }) => {
      push(
        queued
          ? `${money(amount)} saved on this device — it will sync when the connection returns`
          : `Collected ${money(amount)} for ${row!.code}`,
      );
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
            {/* whose money this is, so nobody asks a departing guest for an
                agency's settlement */}
            {row.agent && (
              <div className="mt-0.5 text-[11px] text-amber-700">
                Due from {row.agent.agency}, not the guest
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Amount (${cur()})`}><Input type="number" min={1} value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} /></Field>
            <Field label="Method">
              <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                {methodChoices.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}
              </Select>
            </Field>
          </div>
          <div className="flex justify-end"><Button onClick={() => collect.mutate()} loading={collect.isPending} disabled={amount <= 0}>Record payment</Button></div>
        </div>
      )}
    </Modal>
  );
}
