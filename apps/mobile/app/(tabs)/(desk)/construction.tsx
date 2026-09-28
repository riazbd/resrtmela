/**
 * What the building cost, on a phone.
 *
 * Three questions the owner asked: who has put money in towards building the
 * resort, what the money has gone on, and what is in hand. This is the screen
 * that gets used standing on the site with a mason waiting, which is exactly
 * where a desk is not, so writing a line has to be four taps and not a form.
 *
 * Not the expense book. An expense is the cost of running a resort that is
 * open; this is the cost of building one that is not.
 *
 * The three figures answer for the whole book and never for the lens below
 * them: "in hand" is one number about the resort, and looking at one heading
 * must not change what the till holds.
 */
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { keys, useApi } from "@rh/app-core";
import {
  dayLabel,
  formatMoney,
  methodLabel,
  todayIn,
  type ConstructionBook,
  type ConstructionEntryRow,
  type ConstructionTally,
} from "@rh/shared";
import { client, useAuth } from "../../../src/api/session";
import { WhichResort } from "../../../src/screens/which-resort";
import { Button } from "../../../src/design/button";
import { Chip } from "../../../src/design/chip";
import { Field, Input } from "../../../src/design/input";
import { Lenses } from "../../../src/design/lenses";
import { useMoneyFormat } from "../../../src/design/money";
import { Empty, Loading, Problem, Stale } from "../../../src/design/states";
import { Card, Row, Stat } from "../../../src/design/surface";
import { Text } from "../../../src/design/text";
import { useAction } from "../../../src/design/use-action";
import { color, space } from "../../../src/design/tokens";

const LENSES = ["The book", "Who put in", "What for"] as const;
type Lens = (typeof LENSES)[number];

export default function ConstructionScreen() {
  const { activeResort, can } = useAuth();
  const resortId = activeResort?.id;
  const money = useMoneyFormat();
  const whole = (amount: number) => formatMoney(amount, { ...money, decimals: 0 });

  /**
   * The resort's own words for how money moved. Printing the stored code —
   * "BKASH" — where every other money screen prints "bKash" is the list
   * showing through.
   */
  const methods = useApi<{ code: string; label: string; active: boolean }[]>(
    keys.options(resortId, "PAYMENT_METHOD"),
    () => client.options.list(resortId!, "PAYMENT_METHOD"),
    { enabled: Boolean(resortId) },
  );
  const howItMoved = (code: string | null) =>
    methods.data?.find((m) => m.code === code)?.label ?? methodLabel(code);

  const [lens, setLens] = useState<Lens>("The book");
  const [kind, setKind] = useState<"IN" | "OUT" | null>(null);
  const [writing, setWriting] = useState<"IN" | "OUT" | null>(null);

  const query = { kind: kind ?? undefined, take: 100 };
  const book = useApi<ConstructionBook>(
    keys.construction(resortId, query),
    () => client.construction.book(resortId!, query),
    {
      // `can` as well as the resort: asking for a book this person will be
      // refused spends a request on a 403 and puts a failure in the log for
      // something that is not a fault
      enabled: Boolean(resortId) && can("construction.view"),
      placeholderData: (prev: ConstructionBook | undefined) => prev,
    },
  );

  const header = <Stack.Screen options={{ title: "Construction" }} />;

  if (!can("construction.view")) {
    return (
      <>
        {header}
        <View style={styles.middle}>
          <Empty
            message="Not open to you"
            hint="The construction book is the owner's. Ask them for access if you keep it."
          />
        </View>
      </>
    );
  }
  // an agency has no resort of its own, and somebody between resorts has not
  // chosen one — the same control every other resort screen uses
  if (!resortId) {
    return (
      <>
        {header}
        <WhichResort />
      </>
    );
  }
  if (book.error && !book.data) {
    return (
      <>
        {header}
        <Problem error={book.error} onRetry={() => void book.refetch()} />
      </>
    );
  }
  if (!book.data) {
    return (
      <>
        {header}
        <Loading what="the construction book" />
      </>
    );
  }

  const b = book.data;
  const mayWrite = can("construction.manage");

  return (
    <>
      {header}
      <Stale age={book.stale} />
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={book.isRefetching} onRefresh={() => void book.refetch()} />
        }
      >
        {/*
          Two rows, not three across.

          Three cards on a 412-point phone leave about 118 points each, and
          a building's figures are seven and eight digits where the day
          sheet's are four — which is why the same row of three works there
          and not here. `Stat` would cope: it shrinks to 70% rather than
          wrapping, which is what the browser lens does not do and why it
          drew "৳48,0…". But shrinking is what that setting is for on a
          tile nobody reads twice, and *hate koto taka ase* is the question
          this screen exists to answer.

          So In hand gets a row of its own at full size, and the two figures
          it is made of sit under it.
        */}
        <Stat
          label="In hand"
          value={whole(b.totals.inHand)}
          tone={b.totals.inHand < 0 ? "danger" : "title"}
          sub={b.totals.inHand < 0 ? "Spent more than was put in" : undefined}
        />
        <View style={styles.figures}>
          <Stat label="Put in" value={whole(b.totals.received)} tone="ok" />
          <Stat label="Spent" value={whole(b.totals.spent)} tone="danger" />
        </View>

        {mayWrite ? (
          <View style={styles.actions}>
            {/*
              "Add", because the chips below say "Money in" and "Spending"
              too — and one of those pairs shows a side of the book while the
              other writes to it. Two controls a tap apart meaning different
              things by the same word is how the wrong one gets pressed.
            */}
            <Button label="Add money in" block={false} onPress={() => setWriting("IN")} />
            <Button label="Add spending" kind="ghost" block={false} onPress={() => setWriting("OUT")} />
          </View>
        ) : null}

        <Lenses
          options={LENSES}
          value={lens}
          onChange={setLens}
          countOf={(o) =>
            o === "Who put in" ? b.byContributor.length : o === "What for" ? b.byPurpose.length : b.total
          }
        />

        {lens === "Who put in" ? (
          <TallyCard title="Who put money in" rows={b.byContributor} empty="Nobody yet" whole={whole} />
        ) : lens === "What for" ? (
          <TallyCard title="What it went on" rows={b.byPurpose} empty="Nothing spent yet" whole={whole} />
        ) : (
          <>
            <View style={styles.chips}>
              <Chip label="In and out" on={kind === null} onPress={() => setKind(null)} />
              <Chip label="Money in" on={kind === "IN"} onPress={() => setKind((k) => (k === "IN" ? null : "IN"))} />
              <Chip label="Spending" on={kind === "OUT"} onPress={() => setKind((k) => (k === "OUT" ? null : "OUT"))} />
            </View>

            <Card title={`${b.total} ${b.total === 1 ? "entry" : "entries"}`}>
              {b.rows.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Empty
                    message={kind ? "Nothing on that side yet" : "Nothing written down yet"}
                    hint="Start with the money that came in."
                  />
                </View>
              ) : (
                b.rows.map((e, i) => (
                  <Line
                    key={e.id}
                    entry={e}
                    last={i === b.rows.length - 1}
                    whole={whole}
                    howItMoved={howItMoved}
                  />
                ))
              )}
            </Card>
          </>
        )}
      </ScrollView>

      {writing ? (
        <WriteALine
          kind={writing}
          book={b}
          resortId={resortId}
          timezone={activeResort?.timezone}
          onClose={() => setWriting(null)}
          onSaved={() => {
            setWriting(null);
            void book.refetch();
          }}
        />
      ) : null}
    </>
  );
}

/** One heading and what it comes to. */
function TallyCard({
  title,
  rows,
  empty,
  whole,
}: {
  title: string;
  rows: ConstructionTally[];
  empty: string;
  whole: (amount: number) => string;
}) {
  return (
    <Card title={title}>
      {rows.length === 0 ? (
        <View style={styles.emptyBox}>
          <Empty message={empty} hint="It fills itself as the book is kept." />
        </View>
      ) : (
        rows.map((r, i) => (
          <Row
            key={r.name}
            title={r.name}
            subtitle={`${r.entries} ${r.entries === 1 ? "entry" : "entries"}`}
            last={i === rows.length - 1}
            accessibilityLabel={`${r.name}, ${whole(r.amount)} over ${r.entries} entries`}
            right={
              <Text step="body" weight="medium" tone="title" tabular>
                {whole(r.amount)}
              </Text>
            }
          />
        ))
      )}
    </Card>
  );
}

function Line({
  entry,
  last,
  whole,
  howItMoved,
}: {
  entry: ConstructionEntryRow;
  last: boolean;
  whole: (amount: number) => string;
  /** The resort's own word for the method, not the code stored under it. */
  howItMoved: (code: string | null) => string;
}) {
  const inward = entry.kind === "IN";
  const meta = [
    dayLabel(entry.date),
    howItMoved(entry.method),
    // only ever on the way out; money coming in has a giver, not a payee
    entry.paidTo,
    entry.note,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Row
      title={entry.label}
      subtitle={inward ? "Money in" : "Spending"}
      meta={meta}
      last={last}
      accessibilityLabel={`${inward ? "In" : "Out"}, ${entry.label}, ${whole(entry.amount)}, ${meta}`}
      right={
        <Text step="body" weight="medium" tone={inward ? "ok" : "title"} tabular>
          {inward ? "+" : "−"}
          {whole(entry.amount)}
        </Text>
      }
    />
  );
}

/**
 * A line, written where it happens.
 *
 * The heading is one box with the list under it: press a name that is there,
 * or type one that is not. Asking somebody standing on a building site to go
 * and create "Cement" on a settings screen first is how a book stops being
 * kept.
 */
function WriteALine({
  kind,
  book,
  resortId,
  timezone,
  onClose,
  onSaved,
}: {
  kind: "IN" | "OUT";
  book: ConstructionBook;
  resortId: number;
  /** The resort's own zone — see the note on the date below. */
  timezone: string | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const inward = kind === "IN";
  const choices = inward ? book.contributors : book.purposes;

  const [amount, setAmount] = useState("");
  const [headingId, setHeadingId] = useState<number | null>(null);
  const [headingName, setHeadingName] = useState("");
  const [paidTo, setPaidTo] = useState("");
  const [note, setNote] = useState("");
  const [refused, setRefused] = useState<string | null>(null);

  const save = useAction(async () => {
    setRefused(null);
    const value = Number(amount);
    if (!(value > 0)) {
      setRefused("Put in how much it was.");
      return;
    }
    if (!headingId && !headingName.trim()) {
      setRefused(inward ? "Say who put the money in." : "Say what the money was spent on.");
      return;
    }
    try {
      await client.construction.add(resortId, {
        kind,
        /**
         * The resort's today, not the phone's. This is written while it
         * happens, which is the whole point of the screen being on a phone —
         * and Bangladesh is UTC+6, so for six hours after midnight
         * `toISOString()` would file it on the day before.
         */
        date: todayIn(timezone),
        amount: value,
        ...(inward
          ? headingId
            ? { contributorId: headingId }
            : { contributorName: headingName.trim() }
          : headingId
            ? { purposeId: headingId }
            : { purposeName: headingName.trim() }),
        ...(inward ? {} : { paidTo: paidTo.trim() || undefined }),
        note: note.trim() || undefined,
      });
      onSaved();
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That did not go through.");
    }
  });

  return (
    <View style={styles.sheet}>
      <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
        <Text step="strong" tone="title" weight="medium">
          {inward ? "Money towards the building" : "Money spent on the building"}
        </Text>

        <Field label="How much">
          <Input
            value={amount}
            onChangeText={setAmount}
            keyboardType="number-pad"
            placeholder="0"
            accessibilityLabel="How much"
          />
        </Field>

        <Field
          label={inward ? "Who put it in" : "What it was spent on"}
          hint="Press one, or type a new name"
        >
          <View style={styles.chips}>
            {choices.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                on={headingId === c.id}
                onPress={() => {
                  setHeadingId((now) => (now === c.id ? null : c.id));
                  setHeadingName("");
                }}
              />
            ))}
          </View>
        </Field>

        {headingId === null ? (
          <Field label={inward ? "Their name" : "The heading"}>
            <Input
              value={headingName}
              onChangeText={setHeadingName}
              placeholder={inward ? "Delwar Hossain" : "Cement and rod"}
              accessibilityLabel={inward ? "Their name" : "The heading"}
            />
          </Field>
        ) : null}

        {!inward ? (
          <Field label="Paid to" hint="The shop, the contractor, the mason">
            <Input value={paidTo} onChangeText={setPaidTo} placeholder="Optional" accessibilityLabel="Paid to" />
          </Field>
        ) : null}

        <Field label="Note" hint="Optional">
          <Input value={note} onChangeText={setNote} placeholder="Anything worth remembering" accessibilityLabel="Note" />
        </Field>

        {refused ? (
          <Text step="small" tone="danger" weight="medium">
            {refused}
          </Text>
        ) : null}

        <Button label={inward ? "Write it in" : "Write it down"} loading={save.busy} onPress={save.go} />
        <Button label="Not now" kind="ghost" onPress={onClose} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  middle: { flex: 1, justifyContent: "center", padding: space.lg },
  figures: { flexDirection: "row", gap: space.sm },
  actions: { flexDirection: "row", gap: space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  emptyBox: { paddingVertical: space.lg },
  /**
   * Over the screen rather than beside it. A phone has one column, and a form
   * that pushes the book off the bottom while it is open is a form somebody
   * scrolls past looking for what they were reading.
   */
  sheet: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.screen,
  },
  sheetBody: { padding: space.lg, gap: space.md },
});
