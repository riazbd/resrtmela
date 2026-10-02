/**
 * Bringing the old books in — from the phone, as from the console.
 *
 * This screen said "import runs on the desk" until 2026-10-02. The owner:
 * whatever the console has, the app has. So: choose what is coming in,
 * choose the spreadsheet from the phone, try it first (a dry run writes
 * nothing and says what would happen), then bring it in — and read what
 * happened as pictures and as the console's row-by-row list. The two
 * grids of the old sheet can be reconciled against the calendar here too.
 */
import { useState } from "react";
import { ScrollView, Share, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import {
  SAMPLE_BOOKINGS_CSV,
  SAMPLE_EXPENSES_CSV,
  SAMPLE_FB_CSV,
  type ImportReport,
  type ReconcileReport,
} from "@rh/shared";
import { client, useAuth } from "../../../src/api/session";
import { pickCsv } from "../../../src/api/pick-file";
import { WhichResort } from "../../../src/screens/which-resort";
import { refusal } from "../../../src/screens/payroll-month";
import { Button } from "../../../src/design/button";
import { Kpi, SplitBar } from "../../../src/design/charts";
import { Field, Input } from "../../../src/design/input";
import { Lenses } from "../../../src/design/lenses";
import { Card } from "../../../src/design/surface";
import { Text } from "../../../src/design/text";
import { color, radius, space } from "../../../src/design/tokens";

const KINDS = ["Bookings", "Expenses", "Restaurant", "Reconcile"] as const;
type Kind = (typeof KINDS)[number];

const SAMPLE: Partial<Record<Kind, string>> = {
  Bookings: SAMPLE_BOOKINGS_CSV,
  Expenses: SAMPLE_EXPENSES_CSV,
  Restaurant: SAMPLE_FB_CSV,
};

/** What happened to one row, in the importer's own words and a colour of its own. */
const OUTCOME: Record<string, { label: string; tone: string }> = {
  imported: { label: "Imported", tone: color.chart.money.paid.solid },
  skipped: { label: "Skipped", tone: color.chart.money.late.solid },
  out_of_service: { label: "Room blocked", tone: color.chart.money.left.solid },
  conflict_no_hold: { label: "Overlap", tone: color.chart.money.expense.solid },
};

export default function ImportScreen() {
  const { activeResort, isManagement } = useAuth();
  const [kind, setKind] = useState<Kind>("Bookings");
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [file2, setFile2] = useState<{ name: string; text: string } | null>(null);
  const [roomType, setRoomType] = useState({ name: "Standard", maxAdults: "2", maxChildren: "0" });
  const [report, setReport] = useState<ImportReport | null>(null);
  const [rec, setRec] = useState<ReconcileReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);

  const header = <Stack.Screen options={{ title: "Import CSV" }} />;
  if (!activeResort) return (<>{header}<WhichResort what="where the books go" /></>);
  if (!isManagement) {
    return (
      <>
        {header}
        <ScrollView contentContainerStyle={styles.page}>
          <Card title="Import">
            <Text step="small" tone="muted">
              Bringing old books in is for managers.
            </Text>
          </Card>
        </ScrollView>
      </>
    );
  }
  const rid = activeResort.id;

  async function choose(second = false) {
    setSaid(null);
    try {
      const f = await pickCsv();
      if (!f) return;
      if (second) setFile2(f);
      else setFile(f);
      setReport(null);
      setRec(null);
    } catch (e) {
      setSaid({ ok: false, text: refusal(e) });
    }
  }

  async function run(dryRun: boolean) {
    if (!file) return;
    setBusy(true);
    setSaid(null);
    setReport(null);
    try {
      if (kind === "Expenses") {
        const r = await client.importer.expenses(rid, file.text);
        setSaid({ ok: r.dailyTotalCheck.mismatches.length === 0, text: `Expenses brought in: ${r.imported} (total ${r.total}) · daily totals that disagree with the sheet: ${r.dailyTotalCheck.mismatches.length} of ${r.dailyTotalCheck.compared}` });
      } else if (kind === "Restaurant") {
        const r = await client.importer.fb(rid, file.text);
        setSaid({ ok: r.statusMismatches.length === 0, text: `Restaurant bills brought in: ${r.imported} · status different from the sheet: ${r.statusMismatches.length}` });
      } else {
        const r = await client.importer.bookings(rid, {
          csv: file.text,
          dryRun,
          roomType: { name: roomType.name, maxAdults: Number(roomType.maxAdults) || 2, maxChildren: Number(roomType.maxChildren) || 0 },
        });
        setReport(r);
        setSaid({
          ok: !(dryRun && r.skipped > 0),
          text: dryRun ? `Tried: ${r.imported} would come in, ${r.skipped} skipped, ${r.outOfService} rooms blocked` : `Brought ${r.imported} bookings into ${activeResort!.name}`,
        });
      }
    } catch (e) {
      setSaid({ ok: false, text: refusal(e) });
    } finally {
      setBusy(false);
    }
  }

  async function reconcile() {
    if (!file || !file2) return;
    setBusy(true);
    setSaid(null);
    setRec(null);
    try {
      const r = await client.importer.reconcile(rid, file.text, file2.text);
      setRec(r);
      setSaid({ ok: r.unexplainedCount === 0, text: `Checked ${r.checked} nights across ${r.datesChecked} days — ${r.unexplainedCount} unexplained` });
    } catch (e) {
      setSaid({ ok: false, text: refusal(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {header}
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Lenses
          options={KINDS}
          value={kind}
          onChange={(k) => {
            setKind(k);
            setFile(null);
            setFile2(null);
            setReport(null);
            setRec(null);
            setSaid(null);
          }}
        />

        <Card title={kind === "Reconcile" ? "The two grids of the old sheet" : `${kind} from a spreadsheet`}>
          <View style={styles.gap}>
            {kind === "Reconcile" ? (
              <>
                <Button label={file ? `Balance grid: ${file.name}` : "1. Balance grid CSV (tab 7)"} kind="ghost" onPress={() => void choose(false)} />
                <Button label={file2 ? `Revenue grid: ${file2.name}` : "2. Revenue grid CSV (tab 11)"} kind="ghost" onPress={() => void choose(true)} />
                <Button label="Reconcile" loading={busy} disabled={!file || !file2} onPress={() => void reconcile()} />
              </>
            ) : (
              <>
                <Button label={file ? file.name : "Choose the .csv file"} kind="ghost" onPress={() => void choose(false)} />
                {SAMPLE[kind] ? (
                  <Button label="Get a sample to fill in" kind="subtle" onPress={() => void Share.share({ title: `${kind.toLowerCase()}-sample.csv`, message: SAMPLE[kind]! })} />
                ) : null}
                {kind === "Bookings" ? (
                  <>
                    <Text step="small" weight="medium" tone="title">
                      Rooms the sheet names that are not here yet are made, as this type
                    </Text>
                    <Field label="Call them">
                      <Input value={roomType.name} onChangeText={(t) => setRoomType({ ...roomType, name: t })} />
                    </Field>
                    <View style={styles.pair}>
                      <View style={styles.flex}>
                        <Field label="Adults">
                          <Input value={roomType.maxAdults} onChangeText={(t) => setRoomType({ ...roomType, maxAdults: t })} keyboardType="numeric" />
                        </Field>
                      </View>
                      <View style={styles.flex}>
                        <Field label="Children">
                          <Input value={roomType.maxChildren} onChangeText={(t) => setRoomType({ ...roomType, maxChildren: t })} keyboardType="numeric" />
                        </Field>
                      </View>
                    </View>
                    <Button label="Try it first — nothing is written" kind="ghost" loading={busy} disabled={!file} onPress={() => void run(true)} />
                  </>
                ) : null}
                <Button label="Bring it in" loading={busy} disabled={!file || (kind === "Bookings" && !!report && !report.dryRun && report.imported === 0)} onPress={() => void run(false)} />
              </>
            )}
            {said ? (
              <View style={[styles.note, said.ok ? styles.ok : styles.bad]}>
                <Text step="small" weight="medium" tone={said.ok ? "ok" : "danger"}>
                  {said.text}
                </Text>
              </View>
            ) : null}
          </View>
        </Card>

        {report ? (
          <>
            <View style={styles.figures}>
              <Kpi label="Rows" value={String(report.totalRows)} tint={color.title} />
              <Kpi label={report.dryRun ? "Would come in" : "Came in"} value={String(report.imported)} tint={color.chart.money.paid.solid} />
              <Kpi label="Skipped" value={String(report.skipped)} tint={report.skipped ? color.chart.money.late.solid : color.ink[400]} />
              <Kpi label="Rooms blocked" value={String(report.outOfService)} tint={color.chart.money.left.solid} />
            </View>
            <Card title="Row by row, at a glance">
              <SplitBar
                format={(n) => String(n)}
                parts={[
                  { label: "Imported", value: report.imported, color: OUTCOME.imported!.tone },
                  { label: "Skipped", value: report.skipped, color: OUTCOME.skipped!.tone },
                  { label: "Blocked", value: report.outOfService, color: OUTCOME.out_of_service!.tone },
                  { label: "Overlap", value: report.conflictNoHold, color: OUTCOME.conflict_no_hold!.tone },
                ]}
              />
            </Card>
            {report.replacedDeleted > 0 ? (
              <Text step="small" tone="warn">
                {`${report.dryRun ? "Would replace" : "Replaced"} ${report.replacedDeleted} booking${report.replacedDeleted === 1 ? "" : "s"} you had deleted, because the sheet uses the same booking ID.`}
              </Text>
            ) : null}
            {report.unmatchedReceivers?.length || report.unmatchedAgents?.length ? (
              <Card title="Names that matched nobody here">
                {report.unmatchedReceivers.length ? (
                  <Text step="small" tone="body">{`Received by: ${report.unmatchedReceivers.join(", ")}`}</Text>
                ) : null}
                {report.unmatchedAgents.length ? <Text step="small" tone="body">{`Agents: ${report.unmatchedAgents.join(", ")}`}</Text> : null}
              </Card>
            ) : null}
            {report.roomTypeCreated?.assumed ? (
              <Text step="small" tone="muted">{`A room type was made and called ${report.roomTypeCreated.name} — the suggestion, not your answer. Rename it under Rooms.`}</Text>
            ) : null}
            {report.roomsCreated.length > 0 ? (
              <Card title={`Rooms made (${report.roomsCreated.length})`}>
                <View style={styles.chips}>
                  {report.roomsCreated.map((r) => (
                    <View key={r} style={styles.room}>
                      <Text step="small" weight="bold" tone="ok">
                        {r}
                      </Text>
                    </View>
                  ))}
                </View>
              </Card>
            ) : null}
            <Card title="Row detail">
              {report.rows.map((r) => {
                const o = OUTCOME[r.outcome] ?? { label: r.outcome, tone: color.ink[400] };
                return (
                  <View key={r.rowNo} style={styles.row}>
                    <Text step="caption" tone="muted" tabular style={styles.rowNo}>
                      {`#${r.rowNo}`}
                    </Text>
                    <View style={styles.flex}>
                      <Text step="small" weight="medium" tone="title" numberOfLines={1}>
                        {r.code || "—"}
                      </Text>
                      {r.detail ? (
                        <Text step="caption" tone="muted" numberOfLines={2}>
                          {r.detail}
                        </Text>
                      ) : null}
                    </View>
                    <View style={[styles.pill, { borderColor: o.tone }]}>
                      <Text step="caption" weight="bold" style={{ color: o.tone }}>
                        {o.label}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </Card>
          </>
        ) : null}

        {rec ? (
          <>
            <View style={styles.figures}>
              <Kpi label="Days" value={String(rec.datesChecked)} tint={color.title} />
              <Kpi label="Checks" value={String(rec.checked)} tint={color.chart.money.advance.solid} />
              <Kpi label="Matched" value={String(rec.matched)} tint={color.chart.money.paid.solid} />
              <Kpi label="Unexplained" value={String(rec.unexplainedCount)} tint={rec.unexplainedCount ? color.chart.money.late.solid : color.chart.money.paid.solid} />
            </View>
            {rec.cancelledExplained > 0 ? (
              <Text step="small" tone="muted">{`${rec.cancelledExplained} differences are cancelled or no-show bookings the sheet kept.`}</Text>
            ) : null}
            {rec.unexplained.length > 0 ? (
              <Card title="What does not agree">
                {rec.unexplained.map((u, i) => (
                  <View key={i} style={styles.row}>
                    <View style={styles.flex}>
                      <Text step="small" weight="medium" tone="title">{`${u.date} · ${u.room}`}</Text>
                      <Text step="caption" tone="muted">{`${u.kind} — sheet ${u.sheet}, ours ${String(u.ours)}`}</Text>
                    </View>
                  </View>
                ))}
              </Card>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  gap: { gap: space.md },
  pair: { flexDirection: "row", gap: space.sm },
  flex: { flex: 1 },
  figures: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  room: { backgroundColor: color.ok.bg, borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xs, borderBottomWidth: 1, borderBottomColor: color.line },
  rowNo: { width: 40 },
  pill: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 1 },
  note: { borderRadius: radius.md, padding: space.md, borderWidth: 1 },
  ok: { backgroundColor: color.ok.bg, borderColor: color.ok.line },
  bad: { backgroundColor: color.danger.bg, borderColor: color.danger.line },
});
