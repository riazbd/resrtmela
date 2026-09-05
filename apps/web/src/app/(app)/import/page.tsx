"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Badge, Button, Card, Empty, Spinner, Td, Th, useToast } from "@/components/ui";

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
  rows: {
    rowNo: number;
    code: string;
    outcome: "imported" | "skipped" | "out_of_service" | "conflict_no_hold";
    detail?: string;
  }[];
}

const OUTCOME_BADGE: Record<ImportReport["rows"][number]["outcome"], string> = {
  imported: "CONFIRMED",
  skipped: "CANCELLED",
  out_of_service: "NO_SHOW",
  conflict_no_hold: "PENDING",
};

type ImportTab = "bookings" | "expenses" | "fb" | "reconcile";

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
          body: { csv, roomMap: { "3": "Snow Drop" } },
        });
        push(
          `F&B bills imported: ${r.imported} · status mismatches vs sheet: ${r.statusMismatches.length}`,
          r.statusMismatches.length ? "err" : "ok",
        );
        return;
      }
      const r = await api<ImportReport>(`/resorts/${activeResort.id}/import/bookings`, {
        method: "POST",
        body: { csv, dryRun },
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
            Expects the Sky Eco sheet layout (Booking ID, Guest Name, Mobile, Room, Check-In/Out, …).
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
              {fileName && (
                <span className="text-xs text-slate-500">
                  {fileName} · {(csv.length / 1024).toFixed(1)} KB
                </span>
              )}
            </>
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
              <table className="w-full">
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
              </table>
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
              <table className="w-full min-w-[560px]">
                <thead className="sticky top-0 border-b border-slate-100 bg-white">
                  <tr><Th>Row</Th><Th>Code</Th><Th>Outcome</Th><Th>Detail</Th></tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {report.rows.map((r) => (
                    <tr key={r.rowNo}>
                      <Td className="text-xs text-slate-400">{r.rowNo}</Td>
                      <Td className="font-medium">{r.code}</Td>
                      <Td><Badge value={OUTCOME_BADGE[r.outcome]} /></Td>
                      <Td className="text-xs text-slate-500">{r.detail ?? "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
