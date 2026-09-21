"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Plus, Trash2 } from "lucide-react";
import { client, API_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLoadFailure, LoadFailed } from "@/lib/load-state";
import { Button, Card, Empty, Field, Input, Select, useToast } from "@/components/ui";
import { AgencyWebhooks } from "./agency-webhooks";

/**
 * The API an agency's own website builds against (2026-09-17 design, §3).
 *
 * A secret is shown once, and the page makes that unmissable — the same rule as
 * a resort's key. Beneath the keys is the one page a developer needs: which
 * calls there are, and what a booking made through them is.
 */

interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  active: boolean;
  lastUsedAt: string | null;
}

export default function AgencyApiPage() {
  const { role, can } = useAuth();
  const { push } = useToast();
  const fail = useLoadFailure();
  const [keys, setKeys] = useState<KeyRow[] | null>(null);
  const [name, setName] = useState("");
  const [may, setMay] = useState("read");
  const [busy, setBusy] = useState<string | null>(null);
  const [minted, setMinted] = useState<{ name: string; secret: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    client.agent.apiKeys.list()
      .then((r) => {
        setKeys(r);
        fail.clear();
      })
      .catch(fail.onFail(() => setKeys([])));
  }, []);
  useEffect(() => load(), [load]);

  if (role !== "AGENT") return <Empty msg="Agencies only" />;
  if (!can("agent.apikeys.manage")) return <Empty msg="You do not have access to the agency's API keys" />;
  if (fail.error) return <LoadFailed error={fail.error} onRetry={load} />;
  if (!keys) return <Empty msg="Loading…" />;

  async function create() {
    setBusy("create");
    try {
      const made = await client.agent.apiKeys.create(name, may === "write" ? ["read", "write"] : ["read"]);
      setMinted({ name, secret: made.secret });
      setName("");
      push("Key created — copy it now");
      load();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(null);
    }
  }

  async function revoke(id: string) {
    if (!window.confirm("Revoke this key? Anything using it stops working at once.")) return;
    setBusy(id);
    try {
      await client.agent.apiKeys.revoke(id);
      push("Key revoked");
      load();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">API</h1>
        <p className="text-sm text-slate-500">
          Your own website shows the resorts you sell and your tours, and books into them — as your agency.
        </p>
      </div>

      {minted && (
        <Card title="Copy this now — you will not see it again">
          <p className="text-sm text-slate-600">{minted.name.startsWith("Signing secret") ? minted.name : `Key for ${minted.name}`}</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg bg-slate-900 px-3 py-2 font-mono text-xs text-emerald-300">{minted.secret}</code>
            <Button
              aria-label="Copy the key"
              onClick={() => {
                void navigator.clipboard.writeText(minted.secret);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" onClick={() => setMinted(null)}>Done</Button>
          </div>
          <p className="mt-2 text-xs text-slate-500">We keep only a fingerprint of it, so nobody here can read it back.</p>
        </Card>
      )}

      <Card title="Keys">
        <p className="text-sm text-slate-600">
          Give each website or service its own key, so you can revoke one without breaking the others.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label="What is it for">
            <Input value={name} placeholder="Our website" onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="It may">
            <Select value={may} onChange={(e) => setMay(e.target.value)}>
              <option value="read">Read resorts, prices and what is free</option>
              <option value="write">Read, and make bookings</option>
            </Select>
          </Field>
          <Button onClick={create} loading={busy === "create"} disabled={!name.trim()}>
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
                    rm_live_{k.prefix}_… · {k.scopes.includes("write") ? "reads and books" : "reads only"} ·{" "}
                    {k.lastUsedAt ? `last used ${new Date(k.lastUsedAt).toLocaleDateString()}` : "never used"}
                  </div>
                </div>
                {k.active ? (
                  <Button size="sm" variant="ghost" loading={busy === k.id} onClick={() => revoke(k.id)} aria-label={`Revoke ${k.name}`}>
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">revoked</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <AgencyWebhooks onSecret={(what, secret) => setMinted({ name: what, secret })} />

      <Card title="For whoever builds your site">
        <p className="text-sm text-slate-600">
          Send the key as <code className="font-mono text-xs">Authorization: Bearer …</code>. A resort is named by its
          address (the <code className="font-mono text-xs">slug</code> in <code className="font-mono text-xs">GET /v1/agency</code>),
          and a room by its kind, never by number.
        </p>
        <ul className="mt-3 space-y-1 font-mono text-xs text-slate-700">
          <li>GET  /v1/agency — your agency, the resorts you sell, your tours</li>
          <li>GET  /v1/agency/resorts/:slug/vacancy?from=&amp;to= — what is free</li>
          <li>POST /v1/agency/resorts/:slug/bookings — book (needs Idempotency-Key)</li>
          <li>GET  /v1/agency/resorts/:slug/bookings/:code — one of your bookings</li>
          <li>POST /v1/agency/resorts/:slug/bookings/:code/cancel — ask the resort to cancel</li>
        </ul>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">
{`curl ${API_URL}/v1/agency -H "Authorization: Bearer rm_live_…"

curl -X POST ${API_URL}/v1/agency/resorts/sky-eco-resort/bookings \\
  -H "Authorization: Bearer rm_live_…" \\
  -H "Idempotency-Key: your-own-id-for-this-request" \\
  -H "Content-Type: application/json" \\
  -d '{"roomType":"deluxe","checkIn":"2026-10-01","checkOut":"2026-10-03",
       "adults":2,"guest":{"fullName":"Tania Akter","phone":"01712345000"}}'`}
        </pre>
        <p className="mt-3 text-sm text-slate-600">
          A booking made this way is your agency&apos;s booking, exactly as if you had made it here: it waits for the resort
          to confirm, carries your commission, and follows each resort&apos;s rules — including how far ahead it lets
          agencies book (<code className="font-mono text-xs">bookableUntil</code>). Send the same Idempotency-Key again and
          you get the same booking back, not a second one.
        </p>
        <p className="mt-3 text-sm text-slate-600">
          To check a webhook came from us, compute the HMAC over the raw body and compare it with{" "}
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
