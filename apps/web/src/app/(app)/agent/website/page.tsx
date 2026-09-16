"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, Copy, ExternalLink, Trash2, Upload as UploadIcon } from "lucide-react";
import { api, upload } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLoadFailure, LoadFailed } from "@/lib/load-state";
import { Button, Card, Empty, Field, Input, useToast } from "@/components/ui";
import { OwnDomains } from "@/components/own-domains";

/**
 * An agency's own page (2026-09-17 design, §1).
 *
 * The agency writes the words, the pictures and how to reach it. The resorts
 * and tours on the page are not typed here: they are read from what the agency
 * sells and the packages it has built, so the page is never out of date with
 * the business. What it can decide is which of its resorts to leave off.
 */

interface Draft {
  slug: string;
  name: string;
  published: boolean;
  publishedAt: string | null;
  headline: string | null;
  intro: string | null;
  themeColor: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  address: string | null;
  facebook: string | null;
  instagram: string | null;
  hiddenResortIds: number[];
  resorts: { id: number; slug: string; name: string; location: string | null }[];
  photos: { id: number; url: string; alt: string | null; sortOrder: number }[];
  storage: { used: number; quota: number };
}

const FIELDS = ["headline", "intro", "themeColor", "phone", "email", "whatsapp", "address", "facebook", "instagram"] as const;
type Words = Record<(typeof FIELDS)[number], string>;

const size = (bytes: number): string =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))}KB` : `${(bytes / 1024 / 1024).toFixed(1)}MB`;

export default function AgencyWebsitePage() {
  const { role, can } = useAuth();
  const { push } = useToast();
  const fail = useLoadFailure();
  const [site, setSite] = useState<Draft | null>(null);
  const [words, setWords] = useState<Words>(() => Object.fromEntries(FIELDS.map((f) => [f, ""])) as Words);
  const [hidden, setHidden] = useState<number[]>([]);
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const take = useCallback((s: Draft) => {
    setSite(s);
    setWords(Object.fromEntries(FIELDS.map((f) => [f, s[f] ?? ""])) as Words);
    setHidden(s.hiddenResortIds);
    setAddress(s.slug);
  }, []);

  const load = useCallback(() => {
    api<Draft>("/agent/site")
      .then((s) => {
        take(s);
        fail.clear();
      })
      .catch(fail.onFail(() => setSite(null)));
  }, [take]);
  useEffect(() => load(), [load]);

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    try {
      const r = await fn();
      push(ok);
      if (r && typeof r === "object" && "slug" in r && "photos" in r) take(r as Draft);
      else load();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(null);
    }
  }

  if (role !== "AGENT") return <Empty msg="Agencies only" />;
  if (!can("agent.website.manage")) return <Empty msg="You do not have access to the agency's website" />;
  if (fail.error) return <LoadFailed error={fail.error} onRetry={load} />;
  if (!site) return <Empty msg="Loading…" />;

  const publicUrl = `${typeof window === "undefined" ? "" : window.location.origin}/a/${site.slug}`;
  // blank sends null: "remove my phone number" has to be sayable
  const save = () =>
    run(
      "save",
      () =>
        api("/agent/site", {
          method: "PATCH",
          body: { ...Object.fromEntries(FIELDS.map((f) => [f, words[f].trim() === "" ? null : words[f]])), hiddenResortIds: hidden },
        }),
      "Saved",
    );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Website</h1>
        <p className="text-sm text-slate-500">
          Your agency&apos;s own page: the resorts you sell, your tours, and a way to reach you.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card title="Your page">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <a href={publicUrl} target="_blank" rel="noreferrer" className="truncate text-sm font-semibold text-brand-700 underline underline-offset-4">
                    {publicUrl}
                  </a>
                  <button
                    onClick={() => {
                      void navigator.clipboard.writeText(publicUrl);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                    className="text-slate-400 hover:text-slate-700"
                    aria-label="Copy the address"
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </button>
                  <a href={publicUrl} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-slate-700" aria-label="Open">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {site.published
                    ? "Live. Anyone with the address can see it."
                    : "Not live yet — the address opens for everyone once you publish."}{" "}
                  <a href="/preview/agency" target="_blank" rel="noreferrer" className="font-semibold text-brand-700 underline underline-offset-2">
                    Preview it
                  </a>
                </p>
                {/* every button on the page is a way to reach the agency; with none, the page ends nowhere */}
                {!site.whatsapp && !site.phone && (
                  <p className="mt-1 text-xs font-medium text-amber-700">
                    Add a WhatsApp number or a phone below — that is how visitors reach you.
                  </p>
                )}
              </div>
              <Button
                onClick={() =>
                  run(
                    "publish",
                    () => api("/agent/site/publish", { method: "POST", body: { published: !site.published } }),
                    site.published ? "Your page is off the air" : "Your page is live",
                  )
                }
                loading={busy === "publish"}
                variant={site.published ? "ghost" : undefined}
              >
                {site.published ? "Take it down" : "Publish"}
              </Button>
            </div>
          </Card>

          <Card title="What it says">
            <div className="space-y-3">
              <Field label="Headline">
                <Input value={words.headline} maxLength={160} placeholder="Hill trips and sea breaks, planned for you" onChange={(e) => setWords({ ...words, headline: e.target.value })} />
              </Field>
              <Field label="About your agency">
                <textarea
                  value={words.intro}
                  maxLength={4000}
                  rows={5}
                  placeholder="Who you are, where you take people, and why they come back."
                  onChange={(e) => setWords({ ...words, intro: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Your colour" hint="Used for headings and buttons">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Pick a colour"
                    value={words.themeColor || "#0f5132"}
                    onChange={(e) => setWords({ ...words, themeColor: e.target.value })}
                    className="h-9 w-14 cursor-pointer rounded border border-slate-300"
                  />
                  <Input value={words.themeColor} placeholder="#0f5132" onChange={(e) => setWords({ ...words, themeColor: e.target.value })} className="!w-32" />
                </div>
              </Field>
            </div>
          </Card>

          <Card title="How people reach you">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Phone"><Input value={words.phone} placeholder="01XXX-XXXXXX" onChange={(e) => setWords({ ...words, phone: e.target.value })} /></Field>
              <Field label="WhatsApp" hint="With the country code — 8801…"><Input value={words.whatsapp} placeholder="8801XXXXXXXXX" onChange={(e) => setWords({ ...words, whatsapp: e.target.value })} /></Field>
              <Field label="Email"><Input type="email" value={words.email} placeholder="hello@youragency.com" onChange={(e) => setWords({ ...words, email: e.target.value })} /></Field>
              <Field label="Address"><Input value={words.address} onChange={(e) => setWords({ ...words, address: e.target.value })} /></Field>
              <Field label="Facebook page"><Input value={words.facebook} placeholder="https://facebook.com/…" onChange={(e) => setWords({ ...words, facebook: e.target.value })} /></Field>
              <Field label="Instagram"><Input value={words.instagram} placeholder="https://instagram.com/…" onChange={(e) => setWords({ ...words, instagram: e.target.value })} /></Field>
            </div>
          </Card>

          <Card title={`Resorts on your page (${site.resorts.length - hidden.length} of ${site.resorts.length})`}>
            {site.resorts.length === 0 ? (
              <p className="text-sm text-slate-500">
                You are not approved to sell any resort yet. Resorts appear here as soon as you are — from Discover resorts.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {site.resorts.map((r) => (
                  <li key={r.id}>
                    <label className="flex cursor-pointer items-center gap-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={!hidden.includes(r.id)}
                        onChange={(e) => setHidden(e.target.checked ? hidden.filter((id) => id !== r.id) : [...hidden, r.id])}
                        className="h-4 w-4 rounded border-slate-300 text-brand-600"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-slate-800">{r.name}</span>
                        {r.location && <span className="block text-xs text-slate-400">{r.location}</span>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-slate-500">
              Rooms, pictures and prices come from each resort. A price shows only where the resort shares its rates with agents.
            </p>
          </Card>

          {/* in the flow, not floating: a sticky button sat over the Address box */}
          <div className="flex justify-end">
            <Button onClick={save} loading={busy === "save"}>
              Save changes
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <Card title={`Pictures (${site.photos.length})`}>
            <input
              ref={file}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const chosen = e.target.files?.[0];
                if (!chosen) return;
                await run("photo", () => upload("/agent/site/photos", chosen), "Picture added");
                if (file.current) file.current.value = "";
              }}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => file.current?.click()} loading={busy === "photo"}>
                <UploadIcon className="mr-1.5 h-4 w-4" /> Add a picture
              </Button>
              <span className="text-xs text-slate-400">
                {size(site.storage.used)} of {size(site.storage.quota)} used
              </span>
            </div>
            {site.photos.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No pictures yet. The first one becomes the cover.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {site.photos.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-2 rounded-lg p-2 ring-1 ring-slate-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={p.alt ?? ""} className="h-12 w-16 rounded object-cover" />
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-500">{i === 0 ? "Cover" : p.alt ?? `Picture ${i + 1}`}</span>
                    <button
                      onClick={() => run(`m${p.id}`, () => api(`/agent/site/photos/${p.id}`, { method: "PATCH", body: { sortOrder: i - 1 } }), "Moved")}
                      disabled={i === 0 || busy === `m${p.id}`}
                      className="text-slate-400 hover:text-slate-700 disabled:opacity-25"
                      aria-label="Move earlier"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => run(`m${p.id}`, () => api(`/agent/site/photos/${p.id}`, { method: "PATCH", body: { sortOrder: i + 1 } }), "Moved")}
                      disabled={i === site.photos.length - 1 || busy === `m${p.id}`}
                      className="text-slate-400 hover:text-slate-700 disabled:opacity-25"
                      aria-label="Move later"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => run(`d${p.id}`, () => api(`/agent/site/photos/${p.id}`, { method: "DELETE" }), "Picture removed")}
                      disabled={busy === `d${p.id}`}
                      className="text-red-600 hover:text-red-800"
                      aria-label="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="The address">
            <Field label="Your page lives at" hint="Letters, numbers and dashes">
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
            </Field>
            <Button
              onClick={() => run("address", () => api("/agent/site/address", { method: "POST", body: { slug: address } }), "Address changed")}
              loading={busy === "address"}
              disabled={address === site.slug}
              className="mt-3"
            >
              Change the address
            </Button>
            <p className="mt-2 text-xs text-slate-500">Anyone with the old address stops finding you, so change it before you share it.</p>
          </Card>

          <OwnDomains
            base="/agent/domains"
            example="youragency.com"
            blurb={
              <>
                Point your own address at your page — <b>youragency.com</b> instead of ours. The address above keeps
                working too.
              </>
            }
          />
        </div>
      </div>
    </div>
  );
}
