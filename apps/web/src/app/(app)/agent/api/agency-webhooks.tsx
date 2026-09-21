"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { WEBHOOK_EVENTS } from "@rh/shared";
import { client } from "@/lib/api";
import type { WebhookDeliveryRow, WebhookEndpointRow } from "@rh/shared";
import { Button, Card, Field, Input, useToast } from "@/components/ui";

const TONE: Record<string, string> = {
  delivered: "bg-emerald-50 text-emerald-800",
  trying: "bg-amber-50 text-amber-800",
  "gave up": "bg-red-50 text-red-700",
};

/**
 * Where the agency's website is told about its bookings (2026-09-17).
 *
 * Its own bookings only: made, confirmed by the resort, checked in, cancelled,
 * and the answer to a cancellation request. Each call carries the resort's
 * address, since an agency sells more than one. The signing secret is shown
 * once, through `onSecret`, by the page's one "copy this now" card.
 */
export function AgencyWebhooks({ onSecret }: { onSecret: (what: string, secret: string) => void }) {
  const { push } = useToast();
  const [endpoints, setEndpoints] = useState<WebhookEndpointRow[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDeliveryRow[]>([]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    client.agent.webhooks.list().then(setEndpoints).catch(() => setEndpoints([]));
    client.agent.webhooks.deliveries().then(setDeliveries).catch(() => setDeliveries([]));
  }, []);
  useEffect(() => load(), [load]);

  async function run<T>(key: string, fn: () => Promise<T>, ok: string): Promise<T | null> {
    setBusy(key);
    try {
      const r = await fn();
      push(ok);
      load();
      return r;
    } catch (ex) {
      push((ex as Error).message, "err");
      return null;
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Card title="Where we tell you things">
        <p className="text-sm text-slate-600">
          When one of your bookings is made, confirmed, checked in or cancelled — or a resort answers your request to
          cancel — we post it to your address, signed so your site can tell it came from us.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label="Your address">
            <Input value={url} placeholder="https://youragency.com/resortmela/hook" onChange={(e) => setUrl(e.target.value)} className="!w-80 max-w-full" />
          </Field>
          <Button
            loading={busy === "add"}
            disabled={!url.trim()}
            onClick={async () => {
              const made = await run("add", () => client.agent.webhooks.add(url), "WebhookEndpointRow added — copy the signing secret now");
              if (made) {
                onSecret(`Signing secret for ${url}`, made.secret);
                setUrl("");
              }
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>
        {endpoints.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-100">
            {endpoints.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-700">{e.url}</span>
                <Button size="sm" variant="ghost" aria-label={`Remove ${e.url}`} loading={busy === `e${e.id}`} onClick={() => run(`e${e.id}`, () => client.agent.webhooks.remove(e.id), "Removed")}>
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 rounded-lg bg-slate-50 p-3">
          <div className="text-xs font-semibold text-slate-700">What we will send</div>
          <ul className="mt-1 space-y-0.5">
            {WEBHOOK_EVENTS.map((e) => (
              <li key={e.key} className="text-xs text-slate-500">
                <code className="font-mono text-slate-700">{e.key}</code> — {e.blurb}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">
            Every call carries <code className="font-mono">resort</code> (the resort&apos;s address) beside the booking code.
          </p>
        </div>
      </Card>

      <Card title="What we sent, and what came back">
        {deliveries.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing sent yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {deliveries.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${TONE[d.state]}`}>{d.state}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-slate-800">
                    <code className="font-mono text-xs">{d.event}</code> <span className="text-slate-400">→ {d.endpoint.url}</span>
                  </div>
                  <div className="text-xs text-slate-400">
                    {new Date(d.createdAt).toLocaleString()} · {d.attempts} {d.attempts === 1 ? "try" : "tries"}
                    {d.lastStatus != null && ` · answered ${d.lastStatus}`}
                    {d.lastError && ` · ${d.lastError}`}
                  </div>
                </div>
                {d.state !== "delivered" && (
                  <Button size="sm" variant="ghost" aria-label="Send again" loading={busy === `d${d.id}`} onClick={() => run(`d${d.id}`, () => client.agent.webhooks.retry(d.id), "Queued to send again")}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
