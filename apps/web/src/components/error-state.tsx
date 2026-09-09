"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import { ApiError } from "@/lib/api";
import { useT } from "@/lib/i18n";

/**
 * What a failure looks like.
 *
 * There were no error boundaries at all: a thrown error rendered a blank white
 * page, and the front desk's only move was to reload and hope. Three things
 * fix that, and they are the three things an operator actually needs — say
 * what happened in a sentence, give them the button that usually works, and
 * show the request id so a support call starts with a string that finds the
 * exact line in the log rather than "it broke at about four".
 *
 * It speaks whichever language the console is set to. The person reading this
 * at 11pm in Sajek is more likely to be reading Bangla than English, and a
 * bilingual error message is twice as much to read at the moment somebody has
 * the least patience for reading.
 */
export function ErrorState({
  error,
  reset,
  title,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
  title?: string;
}) {
  const t = useT();
  const api = error instanceof ApiError ? error : null;
  const requestId =
    (api?.payload as { requestId?: string } | undefined)?.requestId ?? error.digest;
  const offline = typeof navigator !== "undefined" && !navigator.onLine;

  // one language, the reader's own — a bilingual error message is twice as
  // much to read at the moment somebody has least patience for reading
  const headline = offline
    ? t("err.offline")
    : title ?? (api?.status === 403 ? t("err.forbidden") : t("err.title"));

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-16 text-center">
      <span className="rounded-full bg-amber-100 p-3 text-amber-600">
        <AlertTriangle className="h-6 w-6" />
      </span>
      <h2 className="text-lg font-bold text-slate-900">{headline}</h2>

      {/* The API writes 4xx messages for the person reading them, so they are
          shown. A 5xx message is replaced server-side by the request id. */}
      {api && api.status < 500 && (
        <p className="rounded-lg bg-slate-50 px-4 py-2 text-sm text-slate-600">{api.message}</p>
      )}

      {offline && <p className="text-sm text-slate-500">{t("err.offlineHint")}</p>}

      {reset && (
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
        >
          <RotateCw className="h-4 w-4" /> {t("c.retry")}
        </button>
      )}

      {requestId && (
        <p className="text-xs text-slate-400">
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">{requestId}</code>
          <span className="block">{t("err.reference")}</span>
        </p>
      )}
    </div>
  );
}

/**
 * The waiting state. A spinner in the middle of an empty page tells the reader
 * nothing about whether anything is coming, so this mirrors the shape of the
 * page that is loading — the layout does not jump when the data lands.
 */
export function Skeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-slate-200" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
