"use client";

import { CloudOff, RefreshCw } from "lucide-react";
import { useOutbox } from "@/lib/outbox";
import { useT } from "@/lib/i18n";

/**
 * What is waiting to reach the server.
 *
 * Queueing silently would be worse than failing: a clerk who does not know a
 * payment is still on the device will not know to check it later, and will
 * take the guest's word for it a week from now. So the count is always
 * visible, each item is named in the words the clerk used, and the retry
 * button is there for the case where the connection came back but the
 * browser's own online event never fired.
 */
export function OutboxBar() {
  const { pending, online, flushing, flush } = useOutbox();
  const t = useT();

  if (pending.length === 0 && online) return null;

  return (
    <div className="sticky top-0 z-30 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
        <CloudOff className="h-4 w-4 shrink-0" />
        <span className="font-medium">
          {online ? `${pending.length} waiting to save` : t("err.offline")}
        </span>
        {pending.length > 0 && (
          <span className="truncate text-amber-800/80">
            {pending.map((p) => p.label).join(" · ")}
          </span>
        )}
        {pending.length > 0 && (
          <button
            onClick={() => void flush()}
            disabled={flushing}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 font-medium text-white transition hover:bg-amber-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${flushing ? "animate-spin" : ""}`} />
            {t("c.retry")}
          </button>
        )}
      </div>
    </div>
  );
}
