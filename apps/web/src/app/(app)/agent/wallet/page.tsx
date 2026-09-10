"use client";

import { useEffect, useState } from "react";
import { api, money, dmy } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card, Empty, Spinner, Stat, Td, Th } from "@/components/ui";
import { Table } from "@/components/patterns";
import { ErrorState } from "@/components/error-state";

/**
 * The agency's account with the platform.
 *
 * `agent.wallet.view` has existed in the permission list since the matrix was
 * built, was granted to every agent, and nothing ever read it: money moved
 * through the wallet and the agent it belonged to had no way to see a balance.
 * The platform held their money and showed them no statement.
 *
 * The wallet belongs to the agency, not to each person — staff spend it, they
 * do not each hold some — so this is the same figure for everyone in the team
 * who is allowed to see it.
 */

interface Txn {
  id: string;
  kind: string;
  amount: number;
  balanceAfter: number;
  note: string | null;
  bookingId: number | null;
  createdAt: string;
}

interface WalletView {
  balance: number;
  active: boolean;
  txns: Txn[];
}

/** What each movement means to the person reading it, not what the enum says. */
const KIND_LABELS: Record<string, string> = {
  TOPUP: "Money received",
  PAYOUT: "Returned to you",
  ADJUST: "Correction",
  // Written before the wallet was narrowed to the agency's account with the
  // platform. What an agency owes a resort, and earns from one, is settled
  // between those two — nothing writes these any more, and old rows still read.
  COMMISSION: "Commission (historic)",
  BOOKING_HOLD: "Booking (historic)",
  REFUND: "Refund (historic)",
};

export default function AgentWalletPage() {
  const { role } = useAuth();
  const [wallet, setWallet] = useState<WalletView | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    api<WalletView>("/agent/wallet").then(setWallet).catch((e) => setError(e as Error));
  }, []);

  if (role !== "AGENT") return <Empty msg="Agents only" />;
  if (error) return <ErrorState error={error} />;
  if (!wallet) return <Spinner />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Wallet</h1>
        <p className="text-sm text-slate-500">The agency&apos;s balance and every movement through it.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Stat label="Balance" value={money(wallet.balance)} tone={wallet.balance > 0 ? "green" : undefined} />
        <Stat label="Status" value={wallet.active ? "Active" : "Inactive"} tone={wallet.active ? undefined : "amber"} />
      </div>

      {!wallet.active && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This wallet is not active yet. The resort activates it when they approve your agency.
        </div>
      )}

      <Card className="!p-0" title="Movements">
        {wallet.txns.length === 0 ? (
          <Empty msg="Nothing has moved through this wallet yet" />
        ) : (
          <Table minWidth={640}>
            <thead className="border-b border-slate-100">
              <tr>
                <Th>When</Th><Th>What</Th><Th>Note</Th>
                <Th className="text-right">Amount</Th><Th className="text-right">Balance after</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {wallet.txns.map((t) => (
                <tr key={t.id}>
                  <Td className="text-xs text-slate-500">{dmy(t.createdAt)}</Td>
                  <Td className="text-sm">{KIND_LABELS[t.kind] ?? t.kind}</Td>
                  <Td className="text-xs text-slate-500">
                    {t.note ?? (t.bookingId ? `booking #${t.bookingId}` : "—")}
                  </Td>
                  <Td className={`text-right font-medium ${t.amount < 0 ? "text-red-700" : "text-green-700"}`}>
                    {t.amount < 0 ? "−" : "+"}{money(Math.abs(t.amount))}
                  </Td>
                  <Td className="text-right text-slate-500">{money(t.balanceAfter)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
