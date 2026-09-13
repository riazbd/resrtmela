"use client";

/**
 * What came in: when, who took it, from whom, what for, how, how much.
 *
 * There is no payment gateway on this platform, so every taka is handed to a
 * person who then tells the software it arrived. That makes this table the
 * cash book — the only account of the money there is — and it reads the same
 * on all three panels on purpose. An owner who learns it once should not have
 * to learn it again on the next screen.
 *
 * The totals come from the server, grouped over every row; the list underneath
 * is capped and says so, because a list of recent receipts is meant to be
 * recent and a truncated list presented as the whole is how a report comes to
 * lie.
 */
import { money, dmy } from "@/lib/api";
import { Card, Empty, Td, Th } from "@/components/ui";
import { Table } from "@/components/patterns";

export interface MoneyLine {
  id: number | string;
  at: string | Date | null;
  amount: number;
  method: string | null;
  /** whose money it was */
  from: string;
  /** what it was for — a booking code, an invoice number, a plan period */
  what: string;
  receivedBy: string | null;
  /** set where a row can be money leaving rather than arriving */
  negative?: boolean;
  note?: string | null;
}

export interface MoneyTotalRow {
  name: string;
  count: number;
  total: number;
}

export function MoneyReceived({
  title = "Who received money",
  rows,
  recent,
  total,
  emptyMsg = "Nothing received in this period",
}: {
  title?: string;
  rows: MoneyTotalRow[];
  recent: MoneyLine[];
  total?: number;
  emptyMsg?: string;
}) {
  if (rows.length === 0 && recent.length === 0) {
    return (
      <Card title={title}>
        <Empty msg={emptyMsg} />
      </Card>
    );
  }

  return (
    <Card title={title}>
      {typeof total === "number" && (
        <div className="mb-3 text-sm text-slate-500">
          Total <span className="font-bold text-brand-700">{money(total)}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {rows.map((r) => (
          <div key={r.name} className="rounded-lg border border-slate-200 p-3">
            <div className="text-sm font-semibold">{r.name}</div>
            <div className="text-xs text-slate-400">{r.count} payment(s)</div>
            <div className="mt-1 text-lg font-bold text-brand-700">{money(r.total)}</div>
          </div>
        ))}
      </div>

      {recent.length > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 text-xs font-semibold text-slate-500">
            Recent receipts ({recent.length})
          </div>
          <Table minWidth={760}>
            <thead className="border-b border-slate-100">
              <tr>
                <Th>When</Th>
                <Th>Who took it</Th>
                <Th>From</Th>
                <Th>For</Th>
                <Th>How</Th>
                <Th className="text-right">Amount</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {recent.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/50">
                  <Td className="whitespace-nowrap text-xs text-slate-500">{p.at ? dmy(p.at) : "—"}</Td>
                  {/*
                    "not recorded" rather than a blank or a guess. These are
                    rows from before the confirmer was stored, and naming
                    somebody who may not have been there would be worse than
                    admitting the gap.
                  */}
                  <Td className="text-xs">{p.receivedBy ?? <span className="text-slate-400">not recorded</span>}</Td>
                  <Td className="text-xs">{p.from}</Td>
                  <Td className="text-xs text-slate-500">{p.what}</Td>
                  <Td className="text-xs text-slate-500">
                    {p.method ?? <span className="text-slate-300">—</span>}
                  </Td>
                  <Td className={`text-right text-xs font-semibold ${p.negative ? "text-red-600" : ""}`}>
                    {p.negative ? `− ${money(p.amount)}` : money(p.amount)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </Card>
  );
}
