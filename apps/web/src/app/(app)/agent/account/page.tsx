"use client";

import { useState } from "react";
import { client, money, dmy } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi, keys, useQueryClient } from "@/lib/query";
import { BarList } from "@/components/charts";
import { MONEY_TONE } from "@rh/shared";
import {
  Button, Card, Empty, Field, Input, Modal, Select, Spinner, Stat, Td, Th, useToast,
} from "@/components/ui";
import { Table } from "@/components/patterns";
import { ErrorState } from "@/components/error-state";
import {
  agentBalanceSays,
  agentEntryLabel,
  todayIn,
  type AgentDeclareKind,
  type AgentStatement,
  type DiscoverResort,
  type MyAccountList,
} from "@rh/shared";

/**
 * What this agency owes each resort, and what each resort owes it.
 *
 * **Not the Wallet.** That is money deposited with the *platform* for
 * subscriptions and email credits. This is the trade account with a supplier —
 * the figure an agency rings a resort about at the end of the month. Two
 * different pockets, and a screen that ran them together would be worse than no
 * screen at all.
 *
 * The figures are the resort's own, from the same fold the resort's console
 * renders, so the two sides cannot arrive at a meeting with different numbers.
 * The one thing an agency may *write* is a declaration — "I sent 9,000 by
 * bKash, here is the TrxID" — which stays outside the balance until somebody at
 * the resort has seen the money. An agency that could confirm its own
 * remittances could reduce what it owes by typing.
 *
 * A declaration says what the money was for (2026-10-01): handed over against
 * stays sold, or put down in advance of them. And an advance can open the
 * account — "Deposit an advance" offers the resorts open to the agency as well
 * as the ones it has sold, because the deposit is often the first thing paid.
 */
export default function MyAccountsPage() {
  const { can } = useAuth();
  const [open, setOpen] = useState<{ id: number; name: string; declare?: AgentDeclareKind } | null>(null);
  const [choosing, setChoosing] = useState(false);

  const { data, isLoading, error } = useApi<MyAccountList>(
    keys.myAccounts(),
    () => client.agent.accounts.list(),
    { enabled: can("agent.account.view"), placeholderData: (prev) => prev },
  );

  if (!can("agent.account.view")) return <Empty msg="You do not have access to the resort accounts" />;
  if (error) return <ErrorState error={error as Error} />;
  if (isLoading && !data) return <Spinner />;

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Resort accounts</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          The running account with each resort you sell — money you are holding of theirs, the
          commission you have earned, and what has been settled. This is not your platform wallet.
        </p>
        {can("agent.remit") && (
          <Button size="sm" variant="ghost" className="mt-3" onClick={() => setChoosing(true)}>
            Deposit an advance
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Due from you" value={money(data?.owedByMe ?? 0)} tone="red" />
        <Stat label="Due to you" value={money(data?.owedToMe ?? 0)} tone="amber" />
        <Stat label="Awaiting confirmation" value={money(data?.pending ?? 0)} />
        <Stat label="Resorts" value={String(rows.length)} />
      </div>

      {rows.some((r) => r.balance !== 0) && (
        <Card title="Where the money is">
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <div className="mb-2 text-xs font-semibold text-slate-500">Due from you, by resort</div>
              <BarList
                format={money}
                limit={8}
                color={MONEY_TONE.late.solid}
                rows={[...rows].filter((r) => r.balance > 0).sort((a, b) => b.balance - a.balance).map((r) => ({ label: r.resort.name, value: r.balance }))}
              />
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold text-slate-500">Due to you, by resort</div>
              <BarList
                format={money}
                limit={8}
                color={MONEY_TONE.paid.solid}
                rows={[...rows].filter((r) => r.balance < 0).sort((a, b) => a.balance - b.balance).map((r) => ({ label: r.resort.name, value: -r.balance }))}
              />
            </div>
          </div>
        </Card>
      )}

      <Card className="!p-0" title="Every resort you have an account with">
        {rows.length === 0 ? (
          <Empty msg="You have not sold a room at any resort yet" />
        ) : (
          <Table minWidth={800}>
            <thead className="border-b border-slate-100">
              <tr>
                <Th>Resort</Th>
                <Th className="text-right">Bookings</Th>
                <Th className="text-right">Commission earned</Th>
                <Th className="text-right">Balance</Th>
                <Th>Which way</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.resort.id} className="border-b border-slate-50 last:border-0">
                  <Td className="font-medium text-slate-700">
                    {r.resort.name}
                    {r.pending > 0 && (
                      <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">
                        {money(r.pending)} waiting
                      </span>
                    )}
                  </Td>
                  <Td className="text-right text-slate-500">{r.bookings}</Td>
                  <Td className="text-right text-slate-500">{money(r.commission)}</Td>
                  <Td className="text-right">
                    <b className={r.balance > 0 ? "text-red-700" : r.balance < 0 ? "text-emerald-700" : "text-slate-400"}>
                      {money(Math.abs(r.balance))}
                    </b>
                  </Td>
                  <Td className="text-xs text-slate-500">
                    {agentBalanceSays(r.balance, "you")}
                  </Td>
                  <Td className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setOpen({ id: r.resort.id, name: r.resort.name })}>
                      Statement
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {open && <MyStatement resort={open} onClose={() => setOpen(null)} />}
      {choosing && (
        <ChooseResort
          known={rows.map((r) => ({ id: r.resort.id, name: r.resort.name }))}
          onChoose={(resort) => {
            setChoosing(false);
            setOpen({ ...resort, declare: "ADVANCE" });
          }}
          onClose={() => setChoosing(false)}
        />
      )}
    </div>
  );
}

/**
 * Which resort an advance goes to: the ones the agency has an account with,
 * and the ones open to it — once each, because a resort it sells is in both.
 */
function ChooseResort({
  known,
  onChoose,
  onClose,
}: {
  known: { id: number; name: string }[];
  onChoose: (resort: { id: number; name: string }) => void;
  onClose: () => void;
}) {
  const { data, isLoading } = useApi<DiscoverResort[]>(["agent-discover"], () => client.agent.discover());
  const choices = [
    ...new Map(
      [...known, ...(data ?? []).filter((r) => r.access === "OPEN")].map((r) => [r.id, { id: r.id, name: r.name }]),
    ).values(),
  ];
  return (
    <Modal open onClose={onClose} title="Deposit an advance with">
      <p className="mb-3 text-sm text-slate-500">
        Money put down ahead of the stays it will pay for. The resort confirms it once the money has
        arrived, and it is set against what is due from you.
      </p>
      {isLoading && known.length === 0 ? (
        <Spinner />
      ) : choices.length === 0 ? (
        <Empty msg="No resort is open to you yet" />
      ) : (
        <div className="flex flex-wrap gap-2">
          {choices.map((r) => (
            <Button key={r.id} size="sm" variant="ghost" onClick={() => onChoose(r)}>
              {r.name}
            </Button>
          ))}
        </div>
      )}
    </Modal>
  );
}

function MyStatement({
  resort,
  onClose,
}: {
  /** `declare` opens it straight on the form, on that kind */
  resort: { id: number; name: string; declare?: AgentDeclareKind };
  onClose: () => void;
}) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const { push } = useToast();
  const [declaring, setDeclaring] = useState<AgentDeclareKind | null>(
    can("agent.remit") ? (resort.declare ?? null) : null,
  );

  const { data, isLoading, error, refetch } = useApi<AgentStatement>(
    keys.myStatement(resort.id),
    () => client.agent.accounts.statement(resort.id),
  );

  const reload = () => {
    void refetch();
    void qc.invalidateQueries({ queryKey: ["myAccounts"] });
  };

  const withdraw = async (entryId: string) => {
    if (!window.confirm("Withdraw this declaration?")) return;
    try {
      await client.agent.accounts.withdraw(entryId);
      push("Withdrawn");
      reload();
    } catch (e) {
      push((e as Error).message, "err");
    }
  };

  return (
    <Modal open onClose={onClose} title={resort.name} wide>
      {error ? (
        <ErrorState error={error as Error} />
      ) : isLoading || !data ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="text-2xl font-semibold text-slate-800">{money(Math.abs(data.balance))}</div>
            <div className="text-sm text-slate-500">
              {agentBalanceSays(data.balance, "you")}
            </div>
            {data.pending > 0 && (
              <div className="mt-2 text-xs text-amber-700">
                {money(data.pending)} declared and not yet confirmed by the resort — outside this figure.
              </div>
            )}
            {data.creditLimit != null && (
              <div className="mt-2 text-xs text-slate-500">
                Credit limit {money(data.creditLimit)}
                {data.overLimit && <b className="ml-2 text-red-700">reached — settle to book again</b>}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="Took from guests" value={money(data.collected)} />
            <Stat label="Handed over" value={money(data.remitted)} />
            {/* put down ahead of the stays — already inside the figure above */}
            <Stat label="Advances" value={money(data.advances)} />
            <Stat label="Commission earned" value={money(data.commission)} />
            <Stat label="Commission received" value={money(data.commissionPaid)} />
          </div>

          <div className="text-xs text-slate-500">
            Your terms here:{" "}
            {data.terms.kind === "FLAT"
              ? `${money(data.terms.rate)} per booking`
              : `${data.terms.rate}% of rent`}
          </div>

          {can("agent.remit") && (
            <Button size="sm" onClick={() => setDeclaring("REMIT")}>
              I have sent money
            </Button>
          )}

          <Card className="!p-0" title="Every line">
            {data.rows.length === 0 ? (
              <Empty msg="Nothing on this account yet" />
            ) : (
              <Table minWidth={640}>
                <thead className="border-b border-slate-100">
                  <tr>
                    <Th>Date</Th>
                    <Th>What</Th>
                    <Th>Stay</Th>
                    <Th>How</Th>
                    <Th className="text-right">Amount</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id} className="border-b border-slate-50 last:border-0">
                      <Td className="whitespace-nowrap text-slate-500">{dmy(r.date)}</Td>
                      <Td>
                        <span className="text-slate-700">{agentEntryLabel(r.kind)}</span>
                        {r.status === "PENDING" && (
                          <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">
                            waiting
                          </span>
                        )}
                        {r.note && <div className="text-xs text-slate-400">{r.note}</div>}
                      </Td>
                      <Td className="text-xs text-slate-500">{r.booking?.code ?? "—"}</Td>
                      <Td className="text-xs text-slate-500">
                        {r.methodLabel ?? "—"}
                        {r.trxId && <div className="text-slate-400">{r.trxId}</div>}
                      </Td>
                      <Td className="text-right">
                        {/* the sign is about the resort's book; the words say what it was */}
                        <b className={r.amount > 0 ? "text-red-700" : "text-emerald-700"}>
                          {money(Math.abs(r.amount))}
                        </b>
                      </Td>
                      <Td className="text-right">
                        {r.status === "PENDING" && can("agent.remit") && (
                          <Button size="sm" variant="ghost" onClick={() => withdraw(r.id)}>
                            Withdraw
                          </Button>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          {declaring && (
            <DeclareForm
              statement={data}
              initialKind={declaring}
              onDone={() => {
                setDeclaring(null);
                reload();
              }}
              onCancel={() => setDeclaring(null)}
            />
          )}
        </div>
      )}
    </Modal>
  );
}

/** "I sent it, here is the TrxID." Pending until the resort matches it. */
function DeclareForm({
  statement,
  initialKind,
  onDone,
  onCancel,
}: {
  statement: AgentStatement;
  initialKind: AgentDeclareKind;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { push } = useToast();
  const [kind, setKind] = useState<AgentDeclareKind>(initialKind);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState(statement.methods[0]?.code ?? "");
  const [trxId, setTrxId] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => todayIn(statement.resort.timezone));
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await client.agent.accounts.declare(statement.resort.id, {
        kind,
        amount: Number(amount) || 0,
        method,
        trxId: trxId || undefined,
        date,
        note: note || undefined,
      });
      push("Sent to the resort to confirm");
      onDone();
    } catch (e) {
      push((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Money sent to the resort">
      <p className="mb-3 text-sm text-slate-500">
        This is recorded straight away and shown to the resort, but it only changes your balance
        once they have matched it against the money.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="What it is"
          hint={kind === "ADVANCE" ? "Put down ahead of the stays it will pay for" : "Guest money you are handing over, or settling up"}
        >
          <Select value={kind} onChange={(e) => setKind(e.target.value as AgentDeclareKind)}>
            <option value="REMIT">For stays sold</option>
            <option value="ADVANCE">An advance</option>
          </Select>
        </Field>
        <Field label="How much">
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </Field>
        <Field label="How you sent it">
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {statement.methods.map((m) => (
              <option key={m.code} value={m.code}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Transaction id" hint="The bKash, Nagad or bank reference">
          <Input value={trxId} onChange={(e) => setTrxId(e.target.value)} />
        </Field>
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Note">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      <div className="mt-4 flex gap-2">
        <Button onClick={submit} disabled={busy}>
          {busy ? "Sending…" : "Tell the resort"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
