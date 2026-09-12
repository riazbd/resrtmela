"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Card, Empty, Field, Input, Spinner, Td, Th, useToast } from "@/components/ui";
import { IMPORT_OUTCOME, type ImportOutcome } from "@/lib/import-outcomes";
import {
  SAMPLE_BOOKINGS_CSV,
  SAMPLE_EXPENSES_CSV,
  SAMPLE_FB_CSV,
  SAMPLE_FILENAMES,
} from "@rh/shared";

interface ImportReport {
  dryRun: boolean;
  totalRows: number;
  imported: number;
  skipped: number;
  outOfService: number;
  conflictNoHold: number;
  roomsCreated: string[];
  guestsCreated: number;
  paymentsCreated: number;
  roomTypeCreated: { name: string; assumed: boolean } | null;
  rows: {
    rowNo: number;
    code: string;
    outcome: "imported" | "skipped" | "out_of_service" | "conflict_no_hold";
    detail?: string;
  }[];
}

/** The importer's own words for what happened to a row — see lib/import-outcomes. */
function OutcomeBadge({ outcome }: { outcome: ImportOutcome }) {
  const { label, style } = IMPORT_OUTCOME[outcome];
  return (
    <span className={`inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${style}`}>
      {label}
    </span>
  );
}

type ImportTab = "bookings" | "expenses" | "fb" | "reconcile";

/**
 * The example sheet for each tab, or null where an example would mislead.
 *
 * Reconcile has none on purpose: the two files it wants are the manager's own
 * grids exported from their own workbook, so a sample would be inventing a
 * layout we do not control and cannot check.
 */
const SAMPLES: Record<ImportTab, { csv: string; filename: string } | null> = {
  bookings: { csv: SAMPLE_BOOKINGS_CSV, filename: SAMPLE_FILENAMES.bookings },
  expenses: { csv: SAMPLE_EXPENSES_CSV, filename: SAMPLE_FILENAMES.expenses },
  fb: { csv: SAMPLE_FB_CSV, filename: SAMPLE_FILENAMES.fb },
  reconcile: null,
};

/**
 * Hand the file to the browser.
 *
 * The BOM is not decoration: Excel on a Bangla Windows install reads a plain
 * UTF-8 CSV in the system codepage, so "বিদ্যুৎ" opens as mojibake and the
 * person's first impression of the sample is that it is broken. The BOM makes
 * Excel read it as UTF-8, and our own parser skips it.
 */
function downloadSample(tab: ImportTab) {
  const sample = SAMPLES[tab];
  if (!sample) return;
  const blob = new Blob(["﻿", sample.csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = sample.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const TABS: { key: ImportTab; label: string }[] = [
  { key: "bookings", label: "Bookings" },
  { key: "expenses", label: "Expenses" },
  { key: "fb", label: "Restaurant bills" },
  { key: "reconcile", label: "Reconcile grids" },
];

interface RecResult {
  datesChecked: number;
  checked: number;
  matched: number;
  cancelledExplained: number;
  unexplainedCount: number;
  unexplained: { date: string; room: string; kind: string; sheet: string; ours: unknown }[];
}

export default function ImportPage() {
  const [tab, setTab] = useState<ImportTab>("bookings");
  const { activeResort, isManagement } = useAuth();
  const { push } = useToast();
  const [csv, setCsv] = useState("");
  const [csv2, setCsv2] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileName2, setFileName2] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [rec, setRec] = useState<RecResult | null>(null);
  const [busy, setBusy] = useState(false);
  /**
   * What to call the room type, for a resort that has none yet.
   *
   * The importer used to decide this on its own — "Standard", two adults, no
   * children — so a resort importing family cottages got its whole inventory
   * typed as a double and nothing said where that had come from. The suggestion
   * is prefilled, so the fast path is unchanged; the answer is the owner's.
   */
  const [roomType, setRoomType] = useState({ name: "Standard", maxAdults: 2, maxChildren: 0 });
  const fileRef = useRef<HTMLInputElement>(null);
  const csv2Ref = useRef<HTMLInputElement>(null);

  const onFile = useCallback((file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result ?? ""));
    reader.readAsText(file);
  }, []);

  const onFile2 = useCallback((file: File) => {
    setFileName2(file.name);
    const reader = new FileReader();
    reader.onload = () => setCsv2(String(reader.result ?? ""));
    reader.readAsText(file);
  }, []);

  async function runReconcile() {
    if (!activeResort || !csv || !csv2) return;
    setBusy(true);
    setRec(null);
    try {
      const r = await api<RecResult>(`/resorts/${activeResort.id}/reconcile`, {
        method: "POST",
        body: { sheet7: csv, sheet11: csv2 },
      });
      setRec(r);
      push(
        `Reconciled ${r.checked} checks across ${r.datesChecked} days — ${r.unexplainedCount} unexplained`,
        r.unexplainedCount ? "err" : "ok",
      );
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function run(dryRun: boolean) {
    if (!activeResort || !csv) return;
    setBusy(true);
    setReport(null);
    try {
      if (tab === "expenses") {
        const r = await api<{
          imported: number;
          skipped: number;
          total: number;
          dailyTotalCheck: { compared: number; mismatches: { date: string; sheet: number; computed: number }[] };
        }>(`/resorts/${activeResort.id}/import/expenses`, { method: "POST", body: { csv } });
        push(
          `Expenses imported: ${r.imported} (total ${r.total}) · daily-total mismatches: ${r.dailyTotalCheck.mismatches.length}/${r.dailyTotalCheck.compared}`,
          r.dailyTotalCheck.mismatches.length ? "err" : "ok",
        );
        return;
      }
      if (tab === "fb") {
        const r = await api<{
          imported: number;
          skipped: number;
          statusMismatches: { code: string; sheet: string; computed: string }[];
        }>(`/resorts/${activeResort.id}/import/fb`, {
          method: "POST",
          // the sheet's own room names are matched directly; a map is only for
          // registers that write something else, and one resort's map is not
          // something to ship to every other resort
          body: { csv },
        });
        push(
          `F&B bills imported: ${r.imported} · status mismatches vs sheet: ${r.statusMismatches.length}`,
          r.statusMismatches.length ? "err" : "ok",
        );
        return;
      }
      const r = await api<ImportReport>(`/resorts/${activeResort.id}/import/bookings`, {
        method: "POST",
        body: { csv, dryRun, roomType },
      });
      setReport(r);
      push(
        dryRun
          ? `Dry run: ${r.imported} importable, ${r.skipped} skipped, ${r.outOfService} out-of-service`
          : `Imported ${r.imported} bookings into ${activeResort.name}`,
        dryRun && r.skipped > 0 ? "err" : "ok",
      );
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  if (!isManagement) return <Empty msg="Managers & admins only" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((x) => (
          <button
            key={x.key}
            onClick={() => { setTab(x.key); setReport(null); setRec(null); }}
            className={`rounded-lg px-3 py-1.5 text-sm transition ${
              tab === x.key ? "bg-brand-600 font-medium text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {x.label}
          </button>
        ))}
      </div>

      <Card
        title={
          tab === "bookings"
            ? `Import bookings from CSV — ${activeResort?.name}`
            : tab === "expenses"
              ? "Import expenses from CSV (tab 4)"
              : tab === "fb"
                ? "Import restaurant bills from CSV (tab 10)"
                : "Reconcile computed grids vs the sheet"
        }
      >
        {tab === "bookings" && (
          <p className="mb-3 text-xs text-slate-500">
            Required columns: <strong>Booking ID, Guest Name, Room, Check-In</strong>. Everything else may
            be blank. Dates like <code>05-Nov-2026</code>, <code>2026-11-05</code> or <code>11/5/2026</code>.
            Guests are deduped by mobile; BK-codes are preserved; advances become ledger entries;
            &quot;out of service&quot; rows flip the room status instead of creating bookings. Always dry-run first.
          </p>
        )}
        {tab === "expenses" && (
          <p className="mb-3 text-xs text-slate-500">
            Columns: Date, Expense Category, Details, Amount. Bangla categories preserved. The sheet&apos;s
            &quot;Daily Total Expense&quot; column is verified against our computed totals on import.
          </p>
        )}
        {tab === "fb" && (
          <p className="mb-3 text-xs text-slate-500">
            Columns: Date, Bill No, Guest Name, Room, Item, Qty, Unit Price, Total, Paid, Due, Status.
            RES-codes preserved; the sheet&apos;s Total column is authoritative; room IDs map via the rooms master.
          </p>
        )}
        {tab === "reconcile" && (
          <p className="mb-3 text-xs text-slate-500">
            Export the manager&apos;s hand-made balance grid (tab 7) and revenue grid (tab 11) as CSV, then
            reconcile against what the software computes from bookings. Zero unexplained differences =
            the software matches the sheet. Cancelled/no-show rows the sheet kept are classified separately.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
          <input
            ref={csv2Ref}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile2(f);
            }}
          />
          {tab === "reconcile" ? (
            <>
              <Button variant="ghost" onClick={() => fileRef.current?.click()}>
                1. Balance grid CSV (tab 7)
              </Button>
              <Button variant="ghost" onClick={() => csv2Ref.current?.click()}>
                2. Revenue grid CSV (tab 11)
              </Button>
              {fileName && <span className="text-xs text-slate-500">{fileName} loaded</span>}
              {fileName2 && <span className="text-xs text-slate-500">{fileName2} loaded</span>}
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => fileRef.current?.click()}>Choose .csv file</Button>
              {/*
                * Beside the picker, not below the explanation: someone who does
                * not yet know what shape their sheet needs is standing at this
                * button, and the answer is easier to open than to read.
                */}
              <button
                type="button"
                onClick={() => downloadSample(tab)}
                className="text-xs font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700"
              >
                Download a sample file
              </button>
              {fileName && (
                <span className="text-xs text-slate-500">
                  {fileName} · {(csv.length / 1024).toFixed(1)} KB
                </span>
              )}
            </>
          )}
          {tab === "bookings" && (
            <div className="flex w-full flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                If this resort has no room types yet
              </span>
              <Field label="Call them">
                <Input
                  value={roomType.name}
                  onChange={(e) => setRoomType({ ...roomType, name: e.target.value })}
                  className="!w-44"
                />
              </Field>
              <Field label="Adults">
                <Input
                  type="number"
                  min={1}
                  value={roomType.maxAdults}
                  onChange={(e) => setRoomType({ ...roomType, maxAdults: Number(e.target.value) })}
                  className="!w-20"
                />
              </Field>
              <Field label="Children">
                <Input
                  type="number"
                  min={0}
                  value={roomType.maxChildren}
                  onChange={(e) => setRoomType({ ...roomType, maxChildren: Number(e.target.value) })}
                  className="!w-20"
                />
              </Field>
              <span className="text-[11px] text-slate-400">
                Ignored when the resort already has room types.
              </span>
            </div>
          )}

          <div className="ml-auto flex gap-2">
            {tab === "reconcile" ? (
              <Button disabled={!csv || !csv2 || busy} loading={busy} onClick={runReconcile}>
                Reconcile grids
              </Button>
            ) : (
              <>
                {tab === "bookings" && (
                  <Button variant="subtle" disabled={!csv || busy} loading={busy} onClick={() => run(true)}>
                    Dry run
                  </Button>
                )}
                <Button
                  disabled={
                    !csv ||
                    busy ||
                    (tab === "bookings" && !!report && !report.dryRun && report.imported === 0)
                  }
                  loading={busy}
                  onClick={() => run(false)}
                >
                  {tab === "bookings" ? "Import for real" : "Import"}
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>

      {rec && (
        <Card title="Grid reconciliation result" className="!p-0">
          <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
            <MiniStat label="Days" value={String(rec.datesChecked)} />
            <MiniStat label="Checks" value={String(rec.checked)} />
            <MiniStat label="Matched" value={String(rec.matched)} tone="green" />
            <MiniStat
              label="Unexplained"
              value={String(rec.unexplainedCount)}
              tone={rec.unexplainedCount ? "red" : "green"}
            />
          </div>
          {rec.cancelledExplained > 0 && (
            <div className="px-4 pb-3 text-xs text-slate-500">
              {rec.cancelledExplained} differences explained by cancelled/no-show bookings (the sheet kept
              them; the software excludes them by design).
            </div>
          )}
          {rec.unexplained.length > 0 && (
            <div className="max-h-64 overflow-auto border-t border-slate-100">
              <div className="overflow-x-auto"><table className="w-full">
                <thead className="sticky top-0 bg-white">
                  <tr><Th>Date</Th><Th>Room</Th><Th>Kind</Th><Th>Sheet</Th><Th>Ours</Th></tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rec.unexplained.map((u, i) => (
                    <tr key={i}>
                      <Td className="text-xs">{u.date}</Td>
                      <Td className="text-xs">{u.room}</Td>
                      <Td className="text-xs">{u.kind}</Td>
                      <Td className="text-xs">{String(u.sheet)}</Td>
                      <Td className="text-xs">{String(u.ours)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          )}
        </Card>
      )}

      {report && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <MiniStat label="Total rows" value={String(report.totalRows)} />
            <MiniStat label={report.dryRun ? "Importable" : "Imported"} value={String(report.imported)} tone="green" />
            <MiniStat label="Skipped" value={String(report.skipped)} tone={report.skipped ? "red" : "default"} />
            <MiniStat label="Out-of-service → room status" value={String(report.outOfService)} tone="amber" />
          </div>
          {report.roomTypeCreated?.assumed && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              This resort had no room types, so the rooms were filed under{" "}
              <b>{report.roomTypeCreated.name}</b> — the suggestion, not your answer. Rename it and
              set its occupancy under Rooms whenever you like.
            </div>
          )}

          {report.roomsCreated.length > 0 && (
            <Card title={`Rooms auto-created (${report.roomsCreated.length})`}>
              <div className="flex flex-wrap gap-1.5">
                {report.roomsCreated.map((r, i) => (
                  <span
                    key={i}
                    className="rounded-md bg-brand-50 px-2 py-1 text-xs text-brand-800 ring-1 ring-brand-200"
                  >
                    {r}
                  </span>
                ))}
              </div>
            </Card>
          )}
          <Card title="Row detail" className="!p-0">
            <div className="max-h-[420px] overflow-auto">
              <div className="overflow-x-auto"><table className="w-full min-w-[560px]">
                <thead className="sticky top-0 border-b border-slate-100 bg-white">
                  <tr><Th>Row</Th><Th>Code</Th><Th>Outcome</Th><Th>Detail</Th></tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {report.rows.map((r) => (
                    <tr key={r.rowNo}>
                      <Td className="text-xs text-slate-400">{r.rowNo}</Td>
                      <Td className="font-medium">{r.code}</Td>
                      <Td><OutcomeBadge outcome={r.outcome} /></Td>
                      <Td className="text-xs text-slate-500">{r.detail ?? "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "green" | "red" | "amber";
}) {
  const tones = {
    default: "text-slate-900",
    green: "text-green-700",
    red: "text-red-700",
    amber: "text-amber-700",
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className={`text-xl font-bold ${tones[tone]}`}>{value}</div>
    </div>
  );
}
