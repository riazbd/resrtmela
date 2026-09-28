"use client";

import { useMemo, useState } from "react";
import { client, money, dmy } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi, keys, useQueryClient } from "@/lib/query";
import { useDebounced } from "@/lib/use-debounced";
import { usePaymentMethods } from "@/lib/resort-options";
import {
  Button, Card, Empty, Field, Input, Modal, Select, Spinner, Stat, Td, Th, useToast,
} from "@/components/ui";
import { Table } from "@/components/patterns";
import { ErrorState } from "@/components/error-state";
import { methodLabel, todayIn, type ConstructionBook, type ConstructionEntryRow } from "@rh/shared";

/**
 * What the building cost.
 *
 * Three questions the owner asked and nothing here could answer: who has put
 * money in towards building the resort, what the money has gone on, and what
 * is in hand.
 *
 * It is not the expense book. An expense is the cost of running a resort that
 * is open; this is the cost of building one that is not, and filing them
 * together would put the roof in last month's profit and loss.
 *
 * The three figures at the top answer for the whole book and never for the
 * filter below them. "In hand" is one number about the resort — narrowing the
 * list to one mason must not change what the till holds, and a total that
 * quietly means "of the fifty lines on screen" is a figure somebody
 * reconciles against and cannot make balance.
 */
export default function ConstructionPage() {
  const { activeResort, can } = useAuth();
  const resortId = activeResort?.id;
  const qc = useQueryClient();
  const { push } = useToast();

  const [kind, setKind] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const q = useDebounced(search, 300);
  /**
   * The resort's own words for how money moved. The column printed the code
   * — "BKASH", "BANK" — where every other money screen prints "bKash" and
   * "Bank transfer", and a list a resort has renamed should read as it was
   * renamed.
   */
  const methods = usePaymentMethods(resortId);
  const howItMoved = (code: string | null) =>
    methods.find((m) => m.code === code)?.label ?? methodLabel(code);
  const [adding, setAdding] = useState<"IN" | "OUT" | null>(null);
  const [editing, setEditing] = useState<ConstructionEntryRow | null>(null);

  const filters = useMemo(
    () => ({ kind: kind || undefined, search: q || undefined, from: from || undefined, to: to || undefined }),
    [kind, q, from, to],
  );

  const { data, isLoading, error } = useApi<ConstructionBook>(
    keys.construction(resortId, filters),
    () => client.construction.book(resortId!, filters),
    // `can` as well as the resort: asking for a book this person will be
    // refused spends a request on a 403 for something that is not a fault
    { enabled: !!resortId && can("construction.view"), placeholderData: (prev) => prev },
  );

  const reload = () => qc.invalidateQueries({ queryKey: ["construction"] });

  if (!can("construction.view")) return <Empty msg="You do not have access to the construction book" />;
  if (!resortId) return <Spinner />;
  if (error) return <ErrorState error={error as Error} />;

  const book = data;
  const rows = book?.rows ?? [];
  const mayWrite = can("construction.manage");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Construction</h1>
          <p className="text-sm text-slate-500">
            Who put money in towards building this resort, what it went on, and what is left.
          </p>
        </div>
        {mayWrite && (
          <div className="flex gap-2">
            {/*
              "Add", because the filter below offers "Money in" and
              "Spending" as well — one pair shows a side of the book and the
              other writes to it. The phone says the same words for the same
              reason.
            */}
            <Button onClick={() => setAdding("IN")}>Add money in</Button>
            <Button variant="ghost" onClick={() => setAdding("OUT")}>Add spending</Button>
          </div>
        )}
      </div>

      {/* the whole book, never the filter — see the note at the top */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Put in" value={money(book?.totals.received ?? 0)} tone="green" />
        <Stat label="Spent" value={money(book?.totals.spent ?? 0)} tone="red" />
        <Stat
          label="In hand"
          value={money(book?.totals.inHand ?? 0)}
          tone={(book?.totals.inHand ?? 0) < 0 ? "red" : "default"}
          sub={(book?.totals.inHand ?? 0) < 0 ? "Spent more than was put in" : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Tally
          title="Who put money in"
          empty="Nobody yet"
          rows={book?.byContributor ?? []}
          total={book?.totals.received ?? 0}
        />
        <Tally
          title="What it went on"
          empty="Nothing spent yet"
          rows={book?.byPurpose ?? []}
          total={book?.totals.spent ?? 0}
        />
      </div>

      <Card
        className="!p-0"
        title="The book"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={kind} onChange={(e) => setKind(e.target.value)} className="!w-36">
              <option value="">In and out</option>
              <option value="IN">Money in</option>
              <option value="OUT">Spending</option>
            </Select>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="!w-40" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="!w-40" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, shop or note…"
              className="!w-56"
            />
          </div>
        }
      >
        {isLoading && !data ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <Empty
            msg={
              kind || q || from || to
                ? "Nothing matches that"
                : "Nothing written down yet — start with the money that came in"
            }
          />
        ) : (
          <Table minWidth={900}>
            <thead className="border-b border-slate-100">
              <tr>
                <Th>Date</Th>
                <Th>In or out</Th>
                <Th>Who / what for</Th>
                <Th>Paid to</Th>
                <Th>How</Th>
                <Th>Entered by</Th>
                <Th className="text-right">Amount</Th>
                {mayWrite && <Th />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <Td className="text-xs">{dmy(e.date)}</Td>
                  <Td>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${
                        e.kind === "IN"
                          ? "bg-green-50 text-green-700 ring-green-200"
                          : "bg-amber-50 text-amber-700 ring-amber-200"
                      }`}
                    >
                      {e.kind === "IN" ? "In" : "Out"}
                    </span>
                  </Td>
                  <Td className="font-medium">
                    {e.label}
                    {e.note && <div className="text-[11px] font-normal text-slate-400">{e.note}</div>}
                  </Td>
                  <Td className="text-xs text-slate-500">{e.paidTo ?? "—"}</Td>
                  <Td className="text-xs text-slate-500">{howItMoved(e.method)}</Td>
                  <Td className="text-xs text-slate-400">{e.enteredBy ?? "—"}</Td>
                  <Td
                    className={`text-right font-semibold ${
                      e.kind === "IN" ? "text-green-700" : "text-slate-900"
                    }`}
                  >
                    {e.kind === "IN" ? "+" : "−"}
                    {money(e.amount)}
                  </Td>
                  {mayWrite && (
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(e)}>Edit</Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="!text-red-600"
                          onClick={async () => {
                            try {
                              await client.construction.remove(resortId, e.id);
                              push("Removed from the book");
                              await reload();
                            } catch (ex) {
                              push((ex as Error).message, "err");
                            }
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="text-xs text-slate-400">
        {rows.length} of {book?.total ?? 0} entries
      </div>

      {/*
        `key` so the form is a new one for every entry it opens on. Its boxes
        are seeded from the entry, and a `useState` initialiser runs once —
        without this, correcting a second line would show the first line's
        figures.
      */}
      <EntryModal
        key={editing ? `edit-${editing.id}` : `new-${adding ?? "none"}`}
        open={adding !== null || editing !== null}
        kind={editing ? (editing.kind as "IN" | "OUT") : (adding ?? "IN")}
        entry={editing}
        book={book}
        resortId={resortId}
        timezone={activeResort?.timezone}
        onClose={() => {
          setAdding(null);
          setEditing(null);
        }}
        onSaved={async () => {
          await reload();
          setAdding(null);
          setEditing(null);
        }}
      />
    </div>
  );
}

/** One side of the book, summed by heading, with what each is of the whole. */
function Tally({
  title,
  rows,
  total,
  empty,
}: {
  title: string;
  rows: { name: string; amount: number; entries: number }[];
  total: number;
  empty: string;
}) {
  return (
    <Card title={title} className="!p-0">
      {rows.length === 0 ? (
        <Empty msg={empty} />
      ) : (
        <div className="divide-y divide-slate-50">
          {rows.map((r) => (
            <div key={r.name} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-800">{r.name}</div>
                <div className="text-[11px] text-slate-400">
                  {r.entries} {r.entries === 1 ? "entry" : "entries"}
                </div>
              </div>
              {/* a share of the whole, drawn rather than written: two numbers
                  side by side is a sum the reader has to do */}
              <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 sm:block">
                <div
                  className="h-full rounded-full bg-brand-500"
                  style={{ width: `${total > 0 ? Math.round((r.amount / total) * 100) : 0}%` }}
                />
              </div>
              <div className="w-28 text-right text-sm font-semibold text-slate-900">
                {money(r.amount)}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/**
 * One line of the book, written or corrected.
 *
 * The heading is one box: choose what is already on the list, or type a name
 * that is not on it yet. Asking somebody to go and create "Cement" on a
 * settings screen before they can write down that they bought cement is how a
 * book stops being kept.
 */
function EntryModal({
  open,
  kind,
  entry,
  book,
  resortId,
  timezone,
  onClose,
  onSaved,
}: {
  open: boolean;
  kind: "IN" | "OUT";
  entry: ConstructionEntryRow | null;
  book: ConstructionBook | undefined;
  resortId: number;
  /** The resort's own zone — see the note on the date below. */
  timezone: string | undefined;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const { push } = useToast();
  const methods = usePaymentMethods(resortId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // re-seeded whenever a different entry opens, which the `key` at the call
  // site forces
  /**
   * The stored date is a full ISO string from the API; the box wants the day.
   * A new entry opens on *the resort's* today, not the browser's — Bangladesh
   * is UTC+6, so for six hours after midnight `new Date().toISOString()`
   * reads yesterday, and a line written at one in the morning would be filed
   * on the day before.
   */
  const [date, setDate] = useState(
    entry?.date ? String(entry.date).slice(0, 10) : todayIn(timezone),
  );
  const [amount, setAmount] = useState(entry ? String(entry.amount) : "");
  const [headingId, setHeadingId] = useState(
    entry ? String((kind === "IN" ? entry.contributorId : entry.purposeId) ?? "") : "",
  );
  const [headingName, setHeadingName] = useState(entry && !entry.contributorId && !entry.purposeId ? entry.label : "");
  const [paidTo, setPaidTo] = useState(entry?.paidTo ?? "");
  const [method, setMethod] = useState(entry?.method ?? "CASH");
  const [note, setNote] = useState(entry?.note ?? "");

  const isIn = kind === "IN";
  const choices = isIn ? (book?.contributors ?? []) : (book?.purposes ?? []);

  async function save() {
    setErr(null);
    const value = Number(amount);
    if (!(value > 0)) {
      setErr("Put in how much it was.");
      return;
    }
    if (!headingId && !headingName.trim()) {
      setErr(isIn ? "Say who put the money in." : "Say what the money was spent on.");
      return;
    }
    setBusy(true);
    try {
      const body = {
        kind,
        date,
        amount: value,
        ...(isIn
          ? headingId
            ? { contributorId: Number(headingId) }
            : { contributorName: headingName.trim() }
          : headingId
            ? { purposeId: Number(headingId) }
            : { purposeName: headingName.trim() }),
        ...(isIn ? {} : { paidTo: paidTo.trim() || undefined }),
        method,
        note: note.trim() || undefined,
      } as const;

      if (entry) await client.construction.update(resortId, entry.id, body);
      else await client.construction.add(resortId, body);

      push(entry ? "Corrected" : isIn ? "Money in, written down" : "Spending written down");
      await onSaved();
    } catch (ex) {
      setErr((ex as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={entry ? "Correct this entry" : isIn ? "Money towards the building" : "Money spent on the building"}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Amount">
            <Input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
            />
          </Field>
        </div>

        <Field
          label={isIn ? "Who put it in" : "What it was spent on"}
          hint="Choose one, or type a new name below"
        >
          <Select
            value={headingId}
            onChange={(e) => {
              setHeadingId(e.target.value);
              if (e.target.value) setHeadingName("");
            }}
          >
            <option value="">{isIn ? "— a new person —" : "— a new heading —"}</option>
            {choices.map((c) => (
              <option key={c.id} value={String(c.id)}>{c.name}</option>
            ))}
          </Select>
        </Field>

        {!headingId && (
          <Field label={isIn ? "Their name" : "The heading"}>
            <Input
              value={headingName}
              onChange={(e) => setHeadingName(e.target.value)}
              placeholder={isIn ? "Delwar Hossain" : "Cement and rod"}
            />
          </Field>
        )}

        {!isIn && (
          <Field label="Paid to" hint="The shop, the contractor, the mason">
            <Input value={paidTo} onChange={(e) => setPaidTo(e.target.value)} placeholder="optional" />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="How">
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {methods.map((m) => (
                <option key={m.code} value={m.code}>{m.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Note">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" />
          </Field>
        </div>

        {err && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">{err}</div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={save}>
            {entry ? "Save the correction" : isIn ? "Write it in" : "Write it down"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
