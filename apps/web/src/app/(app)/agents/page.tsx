"use client";

import { useMemo, useState } from "react";
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
  AGENT_ENTRY_KINDS_STORED,
  agentBalanceSays,
  agentEntryLabel,
  todayIn,
  type AgentAccountList,
  type AgentAccountSummary,
  type AgentStatement,
} from "@rh/shared";

/**
 * What each agent owes, and what the resort owes each of them.
 *
 * This is not the Dues screen, and the difference is the point. Dues says an
 * agency's *bookings* are short — money that may be in the guest's pocket. This
 * says whether the agency is holding the resort's money, is owed commission, or
 * is square. A resort acts on the two differently: one is a phone call to a
 * guest at checkout, the other a settlement between two businesses.
 *
 * **The balance is never computed here.** It is folded by `agentBalance` in
 * `@rh/shared`, which the API and the agency's own app also use, because the
 * first thing two businesses do with a statement is compare it and a figure
 * computed twice eventually differs.
 *
 * The form that matters is "Received from an agent": what came in, and what
 * they kept. That is the shape of the actual event — *"boro vai, ami amar
 * commission raikha apnare baki ta die ditesi"* — and recording it whole is
 * what stops the booking owing the commission for ever.
 */
export default function AgentAccountsPage() {
  const { activeResort, can } = useAuth();
  const resortId = activeResort?.id;
  const qc = useQueryClient();

  const [open, setOpen] = useState<AgentAccountSummary | null>(null);

  const { data, isLoading, error } = useApi<AgentAccountList>(
    keys.agentAccounts(resortId),
    () => client.agentAccounts.list(resortId!),
    { enabled: !!resortId && can("settlement.view"), placeholderData: (prev) => prev },
  );

  if (!can("settlement.view")) return <Empty msg="You do not have access to agent accounts" />;
  if (!resortId) return <Spinner />;
  if (error) return <ErrorState error={error as Error} />;
  if (isLoading && !data) return <Spinner />;

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Agent accounts</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          The running account with each agent who sells this resort — what they are holding of
          yours, what is due to them in commission, and what has been settled. Separate from Dues,
          which is about what is still unpaid on their bookings.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Due from agents" value={money(data?.owedToResort ?? 0)} tone="red" />
        <Stat label="Due to agents" value={money(data?.owedToAgents ?? 0)} tone="amber" />
        <Stat label="Awaiting confirmation" value={money(data?.pending ?? 0)} />
        <Stat label="Accounts" value={String(rows.length)} />
      </div>

      {rows.some((r) => r.balance !== 0) && (
        <Card title="Where the money is">
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <div className="mb-2 text-xs font-semibold text-slate-500">Due from each agency</div>
              <BarList
                format={money}
                limit={8}
                color={MONEY_TONE.late.solid}
                rows={[...rows].filter((r) => r.balance > 0).sort((a, b) => b.balance - a.balance).map((r) => ({ label: r.name, value: r.balance, sub: r.overLimit ? "over its limit" : undefined }))}
              />
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold text-slate-500">Due to each agency</div>
              <BarList
                format={money}
                limit={8}
                color={MONEY_TONE.left.solid}
                rows={[...rows].filter((r) => r.balance < 0).sort((a, b) => a.balance - b.balance).map((r) => ({ label: r.name, value: -r.balance }))}
              />
            </div>
          </div>
        </Card>
      )}

      <Card className="!p-0" title="Every agent this resort sells through">
        {rows.length === 0 ? (
          <Empty msg="No agent has sold a room here yet" />
        ) : (
          <Table minWidth={880}>
            <thead className="border-b border-slate-100">
              <tr>
                <Th>Agent</Th>
                <Th className="text-right">Bookings</Th>
                <Th className="text-right">Holding ours</Th>
                <Th className="text-right">Commission</Th>
                <Th className="text-right">Balance</Th>
                <Th>Which way</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.agencyId} className="border-b border-slate-50 last:border-0">
                  <Td>
                    <span className="font-medium text-slate-700">{r.name}</span>
                    {r.overLimit && (
                      <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-700">
                        over limit
                      </span>
                    )}
                    {r.pending > 0 && (
                      <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">
                        {money(r.pending)} to confirm
                      </span>
                    )}
                  </Td>
                  <Td className="text-right text-slate-500">{r.bookings}</Td>
                  <Td className="text-right text-slate-500">{money(r.collected - r.remitted)}</Td>
                  <Td className="text-right text-slate-500">{money(r.commission)}</Td>
                  <Td className="text-right">
                    <b className={r.balance > 0 ? "text-red-700" : r.balance < 0 ? "text-amber-700" : "text-slate-400"}>
                      {money(Math.abs(r.balance))}
                    </b>
                  </Td>
                  {/* the sentence, not the sign — a signed figure alone is a question */}
                  <Td className="text-xs text-slate-500">
                    {agentBalanceSays(r.balance, r.name)}
                  </Td>
                  <Td className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setOpen(r)}>
                      Open
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {open && (
        <StatementModal
          resortId={resortId}
          summary={open}
          onClose={() => setOpen(null)}
          onChanged={() => qc.invalidateQueries({ queryKey: ["agentAccounts"] })}
          mayManage={can("settlement.manage")}
        />
      )}
    </div>
  );
}

/** One account in full, with every door into it. */
function StatementModal({
  resortId,
  summary,
  onClose,
  onChanged,
  mayManage,
}: {
  resortId: number;
  summary: AgentAccountSummary;
  onClose: () => void;
  onChanged: () => void;
  mayManage: boolean;
}) {
  const { push } = useToast();
  const [form, setForm] = useState<"received" | "entry" | "limit" | null>(null);

  const { data, isLoading, error, refetch } = useApi<AgentStatement>(
    keys.agentStatement(resortId, summary.agencyId),
    () => client.agentAccounts.statement(resortId, summary.agencyId),
  );

  const reload = () => {
    void refetch();
    onChanged();
  };

  const confirm = async (entryId: string) => {
    try {
      await client.agentAccounts.confirm(resortId, entryId);
      push("Confirmed");
      reload();
    } catch (e) {
      push((e as Error).message, "err");
    }
  };

  const remove = async (entryId: string) => {
    if (!window.confirm("Remove this line? The balance will move.")) return;
    try {
      await client.agentAccounts.remove(resortId, entryId);
      push("Removed");
      reload();
    } catch (e) {
      push((e as Error).message, "err");
    }
  };

  return (
    <Modal open onClose={onClose} title={summary.name} wide>
      {error ? (
        <ErrorState error={error as Error} />
      ) : isLoading || !data ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          {/* the figure, and the sentence that says which way it points */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="text-2xl font-semibold text-slate-800">{money(Math.abs(data.balance))}</div>
            <div className="text-sm text-slate-500">
              {agentBalanceSays(data.balance, data.agency.name)}
            </div>
            {data.pending > 0 && (
              <div className="mt-2 text-xs text-amber-700">
                {money(data.pending)} declared by the agent and not yet confirmed — outside this figure.
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Took from guests" value={money(data.collected)} />
            <Stat label="Handed over" value={money(data.remitted)} />
            {/* put down by the agency ahead of its stays — counted in the
                figure above all along, and shown nowhere until 2026-10-01 */}
            <Stat label="Advances" value={money(data.advances)} />
            <Stat label="Commission" value={money(data.commission)} />
            <Stat label="Commission paid out" value={money(data.commissionPaid)} />
            <Stat
              label="Credit limit"
              value={data.creditLimit == null ? "None" : money(data.creditLimit)}
            />
          </div>

          <div className="text-xs text-slate-500">
            Terms: {data.terms.kind === "FLAT" ? `${money(data.terms.rate)} per booking` : `${data.terms.rate}% of rent`}
            {" · "}
            {data.agency.contact}
            {data.agency.phone ? ` · ${data.agency.phone}` : ""}
          </div>

          {mayManage && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setForm("received")}>
                Received from agent
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setForm("entry")}>
                Add a line
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setForm("limit")}>
                Credit limit
              </Button>
            </div>
          )}

          {/*
            The table is 640 wide and not the 760 it started at. This statement
            lives inside a modal, and at 760 the last column — Confirm, Remove
            — was cut in half by the modal's own edge: a button reading "R",
            which a screenshot found and no typecheck could.
          */}
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
                            declared
                          </span>
                        )}
                        {r.rate != null && (
                          <span className="ml-2 text-xs text-slate-400">
                            {r.rateKind === "FLAT" ? `${money(r.rate)} flat` : `${r.rate}%`}
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
                        <b className={r.amount > 0 ? "text-red-700" : "text-emerald-700"}>
                          {r.amount > 0 ? "+" : "−"}
                          {money(Math.abs(r.amount))}
                        </b>
                      </Td>
                      <Td className="whitespace-nowrap text-right">
                        {mayManage && r.status === "PENDING" && (
                          <Button size="sm" variant="ghost" onClick={() => confirm(r.id)}>
                            Confirm
                          </Button>
                        )}
                        {mayManage && r.id.startsWith("e") && (
                          <Button size="sm" variant="ghost" onClick={() => remove(r.id)}>
                            Remove
                          </Button>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          {form === "received" && (
            <ReceivedForm
              statement={data}
              resortId={resortId}
              agencyId={summary.agencyId}
              onDone={() => {
                setForm(null);
                reload();
              }}
              onCancel={() => setForm(null)}
            />
          )}
          {form === "entry" && (
            <EntryForm
              statement={data}
              resortId={resortId}
              agencyId={summary.agencyId}
              onDone={() => {
                setForm(null);
                reload();
              }}
              onCancel={() => setForm(null)}
            />
          )}
          {form === "limit" && (
            <LimitForm
              statement={data}
              resortId={resortId}
              agencyId={summary.agencyId}
              onDone={() => {
                setForm(null);
                reload();
              }}
              onCancel={() => setForm(null)}
            />
          )}
        </div>
      )}
    </Modal>
  );
}

/**
 * The twenty-second door.
 *
 * Two boxes: what arrived, and what the agent kept. The commission box is
 * pre-filled from the terms and is *meant* to be overwritten — what two
 * businesses agreed on the telephone is the fact, and the rate is only a guess
 * about it. The guest's bill is credited with the sum of both, because that is
 * what the guest paid.
 */
function ReceivedForm({
  statement,
  resortId,
  agencyId,
  onDone,
  onCancel,
}: {
  statement: AgentStatement;
  resortId: number;
  agencyId: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { push } = useToast();
  const [amount, setAmount] = useState("");
  const [commission, setCommission] = useState("");
  const [bookingCode, setBookingCode] = useState("");
  const [method, setMethod] = useState(statement.methods[0]?.code ?? "");
  const [trxId, setTrxId] = useState("");
  const [note, setNote] = useState("");
  // the resort's today, never the browser's — Dhaka is UTC+6, so for six hours
  // after midnight `toISOString()` files money on the day before
  const [date, setDate] = useState(() => todayIn(statement.resort.timezone));
  const [busy, setBusy] = useState(false);

  /** Which stays this agency has left unpaid, so a code never has to be typed. */
  const stays = useMemo(
    () =>
      [...new Map(statement.rows.filter((r) => r.booking).map((r) => [r.booking!.code, r.booking!])).values()],
    [statement.rows],
  );

  const suggestion = useMemo(() => {
    const got = Number(amount) || 0;
    if (got <= 0) return 0;
    // what the terms would give on the money that arrived — a starting figure
    return statement.terms.kind === "FLAT"
      ? statement.terms.rate
      : Math.round(((got / (1 - statement.terms.rate / 100)) * (statement.terms.rate / 100)) * 100) / 100;
  }, [amount, statement.terms]);

  const submit = async () => {
    setBusy(true);
    try {
      const booking = stays.find((s) => s.code === bookingCode);
      await client.agentAccounts.received(resortId, agencyId, {
        amount: Number(amount) || 0,
        commission: Number(commission) || 0,
        bookingId: booking?.id,
        method,
        trxId: trxId || undefined,
        date,
        note: note || undefined,
      });
      push("Recorded");
      onDone();
    } catch (e) {
      push((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Received from the agent">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="What came in">
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </Field>
        <Field
          label="What the agent kept as commission"
          hint={suggestion > 0 ? `The terms would give about ${money(suggestion)}` : undefined}
        >
          <Input type="number" value={commission} onChange={(e) => setCommission(e.target.value)} />
        </Field>
        <Field label="Which stay" hint="Leave blank for a settlement covering several">
          <Select value={bookingCode} onChange={(e) => setBookingCode(e.target.value)}>
            <option value="">Not about one stay</option>
            {stays.map((s) => (
              <option key={s.id} value={s.code}>
                {s.code}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="How it came">
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {statement.methods.map((m) => (
              <option key={m.code} value={m.code}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Transaction id" hint="The bKash or bank reference">
          <Input value={trxId} onChange={(e) => setTrxId(e.target.value)} />
        </Field>
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Note">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      {/*
        Only when a stay is chosen, because only then is anything credited.
        This said "the guest's bill will be credited with ৳1,000" whatever was
        picked in the stay box — including "Not about one stay", where no
        payment is written at all. Driving the form found it; the figures were
        right and the sentence was not.
      */}
      {bookingCode && Number(amount) + Number(commission) > 0 ? (
        <p className="mt-3 text-xs text-slate-500">
          {bookingCode}&rsquo;s bill will be credited with{" "}
          <b>{money((Number(amount) || 0) + (Number(commission) || 0))}</b> — what arrived plus what
          was kept, because that is what the guest paid.
        </p>
      ) : Number(amount) > 0 ? (
        <p className="mt-3 text-xs text-slate-500">
          Filed against the account rather than a stay, so no guest&rsquo;s bill changes.
        </p>
      ) : null}
      <div className="mt-4 flex gap-2">
        <Button onClick={submit} disabled={busy}>
          {busy ? "Saving…" : "Record it"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

/** Commission owed, commission paid, an advance, or a correction. */
function EntryForm({
  statement,
  resortId,
  agencyId,
  onDone,
  onCancel,
}: {
  statement: AgentStatement;
  resortId: number;
  agencyId: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { push } = useToast();
  const [kind, setKind] = useState<string>("COMMISSION_PAID");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState(statement.methods[0]?.code ?? "");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => todayIn(statement.resort.timezone));
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await client.agentAccounts.entry(resortId, agencyId, {
        kind,
        amount: Number(amount) || 0,
        method: kind === "ADJUSTMENT" ? undefined : method,
        date,
        note: note || undefined,
      });
      push("Added");
      onDone();
    } catch (e) {
      push((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Add a line">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="What kind">
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            {AGENT_ENTRY_KINDS_STORED.map((k) => (
              <option key={k} value={k}>
                {agentEntryLabel(k)}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Amount"
          hint={
            kind === "ADJUSTMENT"
              ? "Positive raises what is due from them, negative lowers it"
              : undefined
          }
        >
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </Field>
        {kind !== "ADJUSTMENT" && (
          <Field label="How">
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {statement.methods.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Note">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      <div className="mt-4 flex gap-2">
        <Button onClick={submit} disabled={busy}>
          {busy ? "Saving…" : "Add"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

/** How much of the resort's money this agent may hold before booking stops. */
function LimitForm({
  statement,
  resortId,
  agencyId,
  onDone,
  onCancel,
}: {
  statement: AgentStatement;
  resortId: number;
  agencyId: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { push } = useToast();
  const [limit, setLimit] = useState(statement.creditLimit == null ? "" : String(statement.creditLimit));
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await client.agentAccounts.setLimit(resortId, agencyId, limit === "" ? null : Number(limit));
      push(limit === "" ? "Limit removed" : "Limit set");
      onDone();
    } catch (e) {
      push((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Credit limit">
      <p className="mb-3 text-sm text-slate-500">
        When this agent is holding this much of the resort&rsquo;s money, new bookings are refused
        until they settle. Leave it empty for no limit — which is how every account starts.
      </p>
      <Field label="Limit">
        <Input
          type="number"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          placeholder="No limit"
          autoFocus
        />
      </Field>
      <div className="mt-4 flex gap-2">
        <Button onClick={submit} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
