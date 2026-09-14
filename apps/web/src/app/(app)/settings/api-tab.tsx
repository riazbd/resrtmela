"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Plus, RefreshCw, Trash2 } from "lucide-react";
import { WEBHOOK_EVENTS } from "@rh/shared";
import { api, API_URL } from "@/lib/api";
import { useLoadFailure, LoadFailed } from "@/lib/load-state";
import { Button, Card, Empty, Field, Input, Select, useToast } from "@/components/ui";

/**
 * The API a resort's own website builds against (2026-09-15 design).
 *
 * The screen has one job beyond the buttons: a secret is shown once, and the
 * page has to make that unmissable. Everything else here — what a key may do,
 * what was delivered and what was not — exists because an integration that
 * fails silently is a resort losing bookings and blaming us.
 */

interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string[] | null;
  active: boolean;
  lastUsedAt: string | null;
}

interface Endpoint {
  id: number;
  url: string;
  active: boolean;
}

interface Delivery {
  id: string;
  event: string;
  attempts: number;
  lastStatus: number | null;
  lastError: string | null;
  state: "delivered" | "trying" | "gave up";
  createdAt: string;
  endpoint: { url: string };
}

const STATE_TONE: Record<Delivery["state"], string> = {
  delivered: "bg-emerald-50 text-emerald-800",
  trying: "bg-amber-50 text-amber-800",
  "gave up": "bg-red-50 text-red-700",
};

export function ApiTab({ rid }: { rid: number }) {
  const { push } = useToast();
  const fail = useLoadFailure();
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [name, setName] = useState("");
  const [canWrite, setCanWrite] = useState("read");
  const [url, setUrl] = useState("");

  /**
   * The one thing on this page that cannot be fetched again.
   *
   * Held in memory until the owner leaves the tab, and shown as loudly as the
   * page can manage. A secret quietly listed among the rows would be a secret
   * half of them never wrote down.
   */
  const [justMinted, setJustMinted] = useState<{ what: string; secret: string } | null>(null);

  const load = useCallback(() => {
    api<ApiKeyRow[]>(`/resorts/${rid}/api-keys`)
      .then((r) => {
        setKeys(r);
        fail.clear();
      })
      .catch(fail.onFail(() => setKeys([])));
    api<Endpoint[]>(`/resorts/${rid}/webhooks`).then(setEndpoints).catch(() => setEndpoints([]));
    api<Delivery[]>(`/resorts/${rid}/webhooks/deliveries`).then(setDeliveries).catch(() => setDeliveries([]));
  }, [rid]);
  useEffect(() => load(), [load]);

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
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

  if (fail.error) return <LoadFailed error={fail.error} onRetry={load} />;
  if (!keys) return <Empty msg="Loading…" />;

  const mintKey = async () => {
    const made = (await run(
      "key",
      () =>
        api<{ secret: string }>(`/resorts/${rid}/api-keys`, {
          method: "POST",
          body: { name, scopes: canWrite === "write" ? ["read", "write"] : ["read"] },
        }),
      "Key created — copy it now",
    )) as { secret: string } | null;
    if (made) {
      setJustMinted({ what: `Key for ${name}`, secret: made.secret });
      setName("");
    }
  };

  const addEndpoint = async () => {
    const made = (await run(
      "hook",
      () => api<{ secret: string }>(`/resorts/${rid}/webhooks`, { method: "POST", body: { url } }),
      "Endpoint added — copy the signing secret now",
    )) as { secret: string } | null;
    if (made) {
      setJustMinted({ what: `Signing secret for ${url}`, secret: made.secret });
      setUrl("");
    }
  };

  return (
    <div className="space-y-4">
      {justMinted && (
        <Card title="Copy this now — you will not see it again">
          <p className="text-sm text-slate-600">{justMinted.what}</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg bg-slate-900 px-3 py-2 font-mono text-xs text-emerald-300">
              {justMinted.secret}
            </code>
            <Button
              onClick={() => {
                void navigator.clipboard.writeText(justMinted.secret);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" onClick={() => setJustMinted(null)}>
              Done
            </Button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            We keep only a fingerprint of it, so nobody here can read it back — not even us.
          </p>
        </Card>
      )}

      <Card title="Keys">
        <p className="text-sm text-slate-600">
          Your website sends one of these with every request. Give each site or service its own, so
          you can revoke one without breaking the others.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label="What is it for">
            <Input value={name} placeholder="Our website" onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="It may">
            <Select value={canWrite} onChange={(e) => setCanWrite(e.target.value)}>
              <option value="read">Read rooms, rates and availability</option>
              <option value="write">Read, and make bookings</option>
            </Select>
          </Field>
          <Button onClick={mintKey} loading={busy === "key"} disabled={!name.trim()}>
            <Plus className="mr-1 h-4 w-4" /> Create
          </Button>
        </div>

        {keys.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No keys yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {keys.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-800">{k.name}</div>
                  <div className="font-mono text-xs text-slate-400">
                    rm_live_{k.prefix}_… ·{" "}
                    {k.scopes?.includes("write") ? "reads and books" : "reads only"} ·{" "}
                    {k.lastUsedAt ? `last used ${new Date(k.lastUsedAt).toLocaleDateString()}` : "never used"}
                  </div>
                </div>
                {k.active ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={busy === `r${k.id}`}
                    onClick={() =>
                      run(`r${k.id}`, () => api(`/resorts/${rid}/api-keys/${k.id}`, { method: "DELETE" }), "Key revoked")
                    }
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">
                    revoked
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Where we tell you things">
        <p className="text-sm text-slate-600">
          When a booking is made, changed or cancelled here, we post it to your address. Every call
          is signed, so your site can tell ours from anybody else&apos;s.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label="Your address">
            <Input
              value={url}
              placeholder="https://skyecoresort.com/resortmela/hook"
              onChange={(e) => setUrl(e.target.value)}
              className="!w-80"
            />
          </Field>
          <Button onClick={addEndpoint} loading={busy === "hook"} disabled={!url.trim()}>
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>

        {endpoints.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-100">
            {endpoints.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-700">{e.url}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={busy === `e${e.id}`}
                  onClick={() =>
                    run(`e${e.id}`, () => api(`/resorts/${rid}/webhooks/${e.id}`, { method: "DELETE" }), "Removed")
                  }
                >
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
        </div>
      </Card>

      <Card title="What we sent, and what came back">
        {deliveries.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing sent yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {deliveries.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATE_TONE[d.state]}`}>
                  {d.state}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-slate-800">
                    <code className="font-mono text-xs">{d.event}</code>{" "}
                    <span className="text-slate-400">→ {d.endpoint.url}</span>
                  </div>
                  <div className="text-xs text-slate-400">
                    {new Date(d.createdAt).toLocaleString()} · {d.attempts}{" "}
                    {d.attempts === 1 ? "try" : "tries"}
                    {d.lastStatus != null && ` · answered ${d.lastStatus}`}
                    {d.lastError && ` · ${d.lastError}`}
                  </div>
                </div>
                {d.state !== "delivered" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={busy === `d${d.id}`}
                    onClick={() =>
                      run(
                        `d${d.id}`,
                        () => api(`/resorts/${rid}/webhooks/deliveries/${d.id}/retry`, { method: "POST" }),
                        "Queued to send again",
                      )
                    }
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="For whoever builds your site">
        <p className="text-sm text-slate-600">
          Send the key as <code className="font-mono text-xs">Authorization: Bearer …</code>. Every
          booking needs an <code className="font-mono text-xs">Idempotency-Key</code> header of your
          own choosing — send the same one again and you get the same booking back rather than a
          second one.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">
{`curl ${API_URL}/v1/vacancy?from=2026-10-01&to=2026-10-03 \\
  -H "Authorization: Bearer rm_live_…"

curl -X POST ${API_URL}/v1/bookings \\
  -H "Authorization: Bearer rm_live_…" \\
  -H "Idempotency-Key: your-own-id-for-this-request" \\
  -H "Content-Type: application/json" \\
  -d '{"roomType":"deluxe","checkIn":"2026-10-01","checkOut":"2026-10-03",
       "adults":2,"guest":{"fullName":"Rina Haque","phone":"01712345678"}}'`}
        </pre>
        <p className="mt-3 text-sm text-slate-600">
          To check a webhook came from us, compute the same HMAC over the raw body — the bytes as
          they arrived, not a re-serialised object — and compare it with{" "}
          <code className="font-mono text-xs">X-Resort-Signature</code>:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">
{`const expected =
  "sha256=" + crypto.createHmac("sha256", SECRET).update(rawBody, "utf8").digest("hex");
if (expected !== req.headers["x-resort-signature"]) return res.sendStatus(401);`}
        </pre>
      </Card>
    </div>
  );
}
