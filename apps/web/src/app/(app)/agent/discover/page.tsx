"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, bdt } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Card, Empty, Spinner, useToast } from "@/components/ui";
import { Building2, MapPin, Send, Check, Clock } from "lucide-react";

interface DiscoverRow {
  id: number;
  name: string;
  location: string | null;
  roomCount: number;
  roomTypeCount: number;
  priceFrom: number | null;
  access: "APPROVED" | "PENDING" | "REJECTED" | null;
}

export default function AgentDiscoverPage() {
  const { me, role } = useAuth();
  const { push } = useToast();
  const [rows, setRows] = useState<DiscoverRow[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(() => {
    api<DiscoverRow[]>("/agent/discover").then(setRows).catch(() => setRows([]));
  }, []);
  useEffect(() => load(), [load]);

  async function request(resortId: number) {
    setBusy(resortId);
    try {
      await api(`/agent/resorts/${resortId}/access-request`, { method: "POST", body: { note: note || undefined } });
      push("Access request sent — the resort will review it");
      setNote("");
      load();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(null);
    }
  }

  if (!rows) return <Spinner />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Discover resorts</h1>
        <p className="text-sm text-slate-500">Search resorts and request agent access — once approved you can book for your clients.</p>
      </div>

      {rows.length > 0 && (
        <Card>
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-brand-600" />
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note to resorts with your request (agency name, expected volume…)"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <Card key={r.id} className="flex flex-col">
            <div className="flex items-start justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                <Building2 className="h-5 w-5" />
              </div>
              {r.access === "APPROVED" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                  <Check className="h-3 w-3" /> Access approved
                </span>
              )}
              {r.access === "PENDING" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">
                  <Clock className="h-3 w-3" /> Pending
                </span>
              )}
              {r.access === "REJECTED" && (
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700">Rejected</span>
              )}
            </div>
            <div className="mt-3 text-lg font-bold text-slate-900">{r.name}</div>
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <MapPin className="h-3.5 w-3.5" /> {r.location ?? "Bangladesh"}
            </div>
            <div className="mt-2 text-xs text-slate-500">
              {r.roomCount} rooms · {r.roomTypeCount} room types
            </div>
            {r.priceFrom !== null && (
              <div className="mt-1 text-lg font-bold text-brand-700">
                From {bdt(r.priceFrom)} <span className="text-xs font-normal text-slate-400">/night</span>
              </div>
            )}
            <div className="mt-auto pt-4">
              {r.access === "APPROVED" ? (
                <Link href="/bookings" className="block rounded-lg bg-brand-600 py-2 text-center text-sm font-semibold text-white hover:bg-brand-700">
                  Book for client
                </Link>
              ) : r.access === "PENDING" ? (
                <div className="rounded-lg bg-slate-100 py-2 text-center text-sm font-semibold text-slate-500">Waiting for approval</div>
              ) : (
                <Button className="w-full" loading={busy === r.id} onClick={() => request(r.id)}>
                  {r.access === "REJECTED" ? "Request again" : "Request access"}
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
      {rows.length === 0 && <Empty msg="No resorts listed yet" />}
      {role !== "AGENT" && me && (
        <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
          Requests are reviewed by each resort. Once approved, your account becomes an agent with commission tracking and a wallet.
        </div>
      )}
    </div>
  );
}
