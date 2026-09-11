"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, money } from "@/lib/api";
import { Card, Empty, Spinner } from "@/components/ui";
import { Building2, MapPin, Check, Clock } from "lucide-react";

interface DiscoverRow {
  id: number;
  name: string;
  location: string | null;
  roomCount: number;
  roomTypeCount: number;
  priceFrom: number | null;
  /** OPEN: yours to sell now. WAITING: the platform has not verified the agency yet. */
  access: "OPEN" | "WAITING";
  reason: string | null;
}

/**
 * The resorts open to agencies.
 *
 * There used to be a "Request access" button on every card and a manager on
 * the other end clicking Approve, once per agency per resort. The platform
 * verifies an agency once now, and every resort that is open to agents is
 * then the agency's to sell (2026-09-11 design, §8) — so this page lists them,
 * and asks for nothing.
 */
export default function AgentDiscoverPage() {
  const [rows, setRows] = useState<DiscoverRow[] | null>(null);

  useEffect(() => {
    api<DiscoverRow[]>("/agent/discover").then(setRows).catch(() => setRows([]));
  }, []);

  if (!rows) return <Spinner />;
  const waiting = rows.find((r) => r.access === "WAITING")?.reason ?? null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Discover resorts</h1>
        <p className="text-sm text-slate-500">Every resort here is open to agencies — book for your clients at any of them, on the resort&apos;s commission.</p>
      </div>

      {waiting && (
        <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" /> {waiting}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <Card key={r.id} className="flex flex-col">
            <div className="flex items-start justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                <Building2 className="h-5 w-5" />
              </div>
              {r.access === "OPEN" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                  <Check className="h-3 w-3" /> Open to you
                </span>
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
                From {money(r.priceFrom)} <span className="text-xs font-normal text-slate-400">/night</span>
              </div>
            )}
            <div className="mt-auto pt-4">
              {r.access === "OPEN" ? (
                <Link href="/agent/search" className="block rounded-lg bg-brand-600 py-2 text-center text-sm font-semibold text-white hover:bg-brand-700">
                  Find a room for a client
                </Link>
              ) : (
                <div className="rounded-lg bg-slate-100 py-2 text-center text-sm font-semibold text-slate-500">Waiting for verification</div>
              )}
            </div>
          </Card>
        ))}
      </div>
      {rows.length === 0 && <Empty msg="No resort is open to agencies yet" />}
    </div>
  );
}
