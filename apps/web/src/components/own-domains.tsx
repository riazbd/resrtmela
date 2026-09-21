"use client";

import { useCallback, useEffect, useState } from "react";
import type { DomainRow } from "@rh/shared";
import { Button, Card, Input, useToast } from "@/components/ui";

/**
 * "Your own domain" — one card for a resort and an agency (2026-09-17).
 *
 * The same four steps for both: add the name, put the TXT record in the
 * DNS, press Check, and wait for the certificate.
 *
 * It took a `base` path — `/resorts/:id/domains` or `/agent/domains` —
 * and built five URLs out of it by hand, which is a component holding a
 * private copy of the API's shape. It takes the four calls now, from
 * `client.domains` or `client.agent.domains`; nothing else differs, and
 * a route that moves is a build failure rather than a 404 in front of
 * somebody halfway through proving a domain.
 */

/** What each state means, said to the person who has to act on it. */
const DOMAIN_STATE: Record<string, { label: string; tone: string; what: string }> = {
  WAITING_FOR_DNS: {
    label: "waiting for your DNS",
    tone: "bg-amber-50 text-amber-800",
    what: "Add the record below at your registrar, then press Check.",
  },
  WAITING_FOR_US: {
    label: "waiting for us",
    tone: "bg-sky-50 text-sky-800",
    what: "Proved. We are setting up the certificate — usually within the hour.",
  },
  LIVE: { label: "live", tone: "bg-emerald-50 text-emerald-800", what: "Your site answers at this address." },
};

export interface DomainCalls {
  list: () => Promise<DomainRow[]>;
  claim: (host: string) => Promise<unknown>;
  verify: (domainId: number) => Promise<unknown>;
  setCanonical: (domainId: number) => Promise<unknown>;
  remove: (domainId: number) => Promise<unknown>;
}

export function OwnDomains({
  calls,
  example,
  blurb,
}: {
  calls: DomainCalls;
  example: string;
  blurb: React.ReactNode;
}) {
  const { push } = useToast();
  const [domains, setDomains] = useState<DomainRow[]>([]);
  const [wanted, setWanted] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    calls.list().then(setDomains).catch(() => setDomains([]));
  }, [calls]);
  useEffect(() => load(), [load]);

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    try {
      await fn();
      push(ok);
      load();
      return true;
    } catch (ex) {
      push((ex as Error).message, "err");
      return false;
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card title="Your own domain">
      <p className="text-sm text-slate-600">{blurb}</p>
      <div className="mt-3 flex gap-2">
        <Input value={wanted} placeholder={example} onChange={(e) => setWanted(e.target.value)} />
        <Button
          loading={busy === "claim"}
          disabled={!wanted.trim()}
          onClick={async () => {
            if (await run("claim", () => calls.claim(wanted), "Domain added — now add the record")) setWanted("");
          }}
        >
          Add
        </Button>
      </div>

      {domains.length > 0 && (
        <ul className="mt-4 space-y-3">
          {domains.map((d) => {
            const state = DOMAIN_STATE[d.state]!;
            return (
              <li key={d.id} className="rounded-xl p-3 ring-1 ring-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="break-all font-semibold text-slate-900">
                    {d.host}
                    {d.canonical && <span className="ml-2 text-xs font-normal text-slate-400">main</span>}
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${state.tone}`}>{state.label}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{state.what}</p>

                {d.state === "WAITING_FOR_DNS" && (
                  <div className="mt-2 space-y-1 rounded-lg bg-slate-50 p-2 font-mono text-[11px] text-slate-700">
                    <div>Type: {d.record.type}</div>
                    <div className="break-all">Name: {d.record.name}</div>
                    <div className="break-all text-slate-400">or just: {d.record.shortName}</div>
                    <div className="break-all">Value: {d.record.value}</div>
                  </div>
                )}

                <div className="mt-2 flex flex-wrap gap-2">
                  {d.state === "WAITING_FOR_DNS" && (
                    <Button size="sm" loading={busy === `v${d.id}`} onClick={() => run(`v${d.id}`, () => calls.verify(d.id), "Proved — we will set it up shortly")}>
                      Check
                    </Button>
                  )}
                  {d.state !== "WAITING_FOR_DNS" && !d.canonical && (
                    <Button size="sm" variant="ghost" loading={busy === `c${d.id}`} onClick={() => run(`c${d.id}`, () => calls.setCanonical(d.id), "That is the main address now")}>
                      Make it the main one
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" loading={busy === `x${d.id}`} onClick={() => run(`x${d.id}`, () => calls.remove(d.id), "Domain removed")}>
                    Remove
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
