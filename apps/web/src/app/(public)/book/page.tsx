"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, bdt, type GuestResort } from "@/lib/api";
import { Card, Empty, Spinner } from "@/components/ui";

export default function DiscoverPage() {
  const [resorts, setResorts] = useState<GuestResort[] | null>(null);

  useEffect(() => {
    api<GuestResort[]>("/guest/resorts").then(setResorts).catch(() => setResorts([]));
  }, []);

  if (resorts === null) return <Spinner />;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">Find your resort</h1>
      <p className="mt-1 text-slate-500">Book rooms & activities — pay at the resort.</p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {resorts.length === 0 && <Empty msg="No resorts listed yet" />}
        {resorts.map((r) => {
          const prices = (r.roomTypes ?? []).map((t) => t.priceFrom).filter((p): p is number => p !== null);
          const min = prices.length ? Math.min(...prices) : null;
          return (
            <Link key={r.id} href={`/book/${r.id}`} className="group">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition group-hover:shadow-md">
                <div className="flex h-40 items-end bg-gradient-to-br from-brand-700 to-emerald-500 p-4">
                  <div>
                    <div className="text-lg font-bold text-white">{r.name}</div>
                    {r.location && <div className="text-xs text-emerald-100">{r.location}</div>}
                  </div>
                </div>
                <div className="p-4">
                  <div className="text-xs text-slate-400">
                    {(r.roomTypes ?? []).length} room type(s){r.roomCount ? ` · ${r.roomCount} rooms` : ""}
                  </div>
                  {min !== null && (
                    <div className="mt-1 text-lg font-bold text-brand-700">
                      From ৳{min.toLocaleString("en-IN")} <span className="text-xs font-normal text-slate-400">/ night</span>
                    </div>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
