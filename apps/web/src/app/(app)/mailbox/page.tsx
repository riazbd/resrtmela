"use client";

import { useCallback, useEffect, useState } from "react";
import { api, dmy, money } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Card, Empty, Field, Input, Select, useToast } from "@/components/ui";
import { Mail, ShoppingCart, Send } from "lucide-react";

interface CampaignRow {
  id: string;
  subject: string;
  recipients: number;
  status: string;
  sentAt: string;
}

/**
 * What the platform sells is the platform's decision.
 *
 * These three packs used to be written out here with their prices as strings,
 * and again in the request validator, and again in the service. So the platform
 * could not change what it sells without a deploy, and the three lists could
 * disagree in the meantime. They come from the super admin's settings now.
 */
interface CreditPack {
  credits: number;
  price: number;
}

export default function MailboxPage() {
  const { activeResort, isManagement, role } = useAuth();
  const { push } = useToast();
  const [credits, setCredits] = useState<number | null>(null);
  const [history, setHistory] = useState<CampaignRow[] | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState("RESORT_GUESTS");
  const [busy, setBusy] = useState(false);
  const [packs, setPacks] = useState<CreditPack[]>([]);
  const isAgent = role === "AGENT";

  const load = useCallback(async () => {
    const c = await api<{ credits: number }>("/email-credits").catch(() => null);
    setCredits(c?.credits ?? 0);
    api<CreditPack[]>("/email-credits/packs").then(setPacks).catch(() => setPacks([]));
    api<CampaignRow[]>("/email-campaigns").then(setHistory).catch(() => setHistory([]));
  }, []);
  useEffect(() => {
    load();
    setAudience(isAgent ? "MY_GUESTS" : "RESORT_GUESTS");
  }, [load, isAgent]);

  async function buy(pack: number) {
    setBusy(true);
    try {
      const r = await api<{ credits: number; added: number; price: number }>("/email-credits/purchase", {
        method: "POST",
        body: { credits: pack },
      });
      // the credits are real and immediate; the money is not taken here, and
      // saying "purchased" would be the software describing something it did
      // not do
      push(`${r.added} credits added — ${money(r.price)} will be invoiced`);
      load();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    setBusy(true);
    try {
      const r = await api<{ sent: number; failed: number }>("/email-campaigns", {
        method: "POST",
        body: {
          subject,
          body,
          audience,
          resortId: audience === "RESORT_GUESTS" || audience === "AGENTS" ? activeResort?.id : undefined,
        },
      });
      push(`Sent to ${r.sent} recipient(s)${r.failed ? `, ${r.failed} failed` : ""}`);
      setSubject("");
      setBody("");
      load();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Bulk Email</h1>
        <p className="text-sm text-slate-500">Buy credits and send greetings, offers & updates to your guests{isAgent ? "" : " and agents"}.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card title="Compose campaign">
            <div className="space-y-3">
              <Field label="Audience">
                <Select value={audience} onChange={(e) => setAudience(e.target.value)}>
                  {isAgent ? (
                    <option value="MY_GUESTS">My clients (guests on my bookings with email)</option>
                  ) : (
                    <>
                      <option value="RESORT_GUESTS">All resort guests (with email)</option>
                      <option value="AGENTS">My agents (with email)</option>
                    </>
                  )}
                </Select>
              </Field>
              <Field label="Subject"><Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Eid greetings from {resort name}" /></Field>
              <Field label="Message" hint="plain text — sent as a formatted email">
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={8}
                  placeholder={"Dear guest,\n\nWishing you a wonderful season ahead…\n\n— Team Resort Mela"}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                />
              </Field>
              <div className="flex items-center gap-3">
                <Button onClick={send} loading={busy} disabled={!subject || !body || (credits ?? 0) <= 0}>
                  <Send className="h-4 w-4" /> Send now
                </Button>
                <span className="text-xs text-slate-400">1 credit per recipient · {credits ?? 0} available</span>
              </div>
            </div>
          </Card>

          <Card title="Sent history">
            {!history ? <Empty msg="Loading…" /> : history.length === 0 ? (
              <Empty msg="No campaigns yet" />
            ) : (
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead className="border-b border-slate-100"><tr><th className="px-2 py-2 text-left text-[11px] font-semibold uppercase text-slate-400">Subject</th><th className="px-2 py-2 text-right text-[11px] font-semibold uppercase text-slate-400">Recipients</th><th className="px-2 py-2 text-right text-[11px] font-semibold uppercase text-slate-400">When</th></tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {history.map((c) => (
                    <tr key={c.id}>
                      <td className="px-2 py-2 text-slate-800">{c.subject}</td>
                      <td className="px-2 py-2 text-right text-slate-600">{c.recipients}</td>
                      <td className="px-2 py-2 text-right text-xs text-slate-400">{dmy(c.sentAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Email credits">
            <div className="flex items-center gap-3">
              <Mail className="h-8 w-8 text-brand-500" />
              <div>
                <div className="text-3xl font-black text-slate-900">{credits ?? "…"}</div>
                <div className="text-xs text-slate-400">credits available</div>
              </div>
            </div>
          </Card>
          <Card title="Add credits">
            <div className="space-y-2.5">
              {packs.length === 0 && (
                <div className="rounded-xl border border-slate-200 px-4 py-3 text-xs text-slate-400">
                  No packs are on sale at the moment.
                </div>
              )}
              {packs.map((p) => (
                <button
                  key={p.credits}
                  onClick={() => buy(p.credits)}
                  disabled={busy}
                  className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left transition hover:border-brand-400 hover:bg-brand-50/40"
                >
                  <span className="flex items-center gap-2.5">
                    <ShoppingCart className="h-4 w-4 text-brand-600" />
                    <span className="text-sm font-bold">{p.credits.toLocaleString("en-IN")} emails</span>
                  </span>
                  <span className="text-sm font-black text-brand-700">{money(p.price)}</span>
                </button>
              ))}
              {/* This sat in grey micro-text under a bold price, which is where
                  a disclaimer goes when nobody wants it read. No card is
                  charged here; the credits arrive and the amount is billed. */}
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
                <b>Nothing is charged now.</b> The credits are added straight away and the amount is
                added to your platform bill. Emails go out through your own configured SMTP account.
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
