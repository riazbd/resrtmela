"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, Copy, ExternalLink, Trash2, Upload as UploadIcon } from "lucide-react";
import { api, upload } from "@/lib/api";
import { useLoadFailure, LoadFailed } from "@/lib/load-state";
import { Button, Card, Empty, Field, Input, Select, useToast } from "@/components/ui";
import { OwnDomains } from "@/components/own-domains";

/**
 * The owner's own website, written from the panel (2026-09-14 design, §5.3).
 *
 * Everything on this screen is the half the system does not already know. The
 * prices, the rooms and what is free come from the resort's own records and are
 * deliberately not editable here — a website that could disagree with the
 * calendar is the whole problem this feature exists to avoid.
 */

interface SiteDraft {
  slug: string;
  published: boolean;
  publishedAt: string | null;
  template: string;
  headline: string | null;
  intro: string | null;
  amenities: string[];
  themeColor: string | null;
  map: { lat: number; lng: number } | null;
  whatsapp: string | null;
  facebook: string | null;
  instagram: string | null;
  photos: { id: number; url: string; roomTypeId: number | null; alt: string | null; sortOrder: number }[];
  templates: { key: string; label: string; blurb: string }[];
  storage: { used: number; quota: number };
}

interface RoomType {
  id: number;
  name: string;
}

/** A size in the unit a person would say it in — "38KB", not "0.0MB". */
const size = (bytes: number): string =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))}KB` : `${(bytes / 1024 / 1024).toFixed(1)}MB`;

export function WebsiteTab({ rid }: { rid: number }) {
  const { push } = useToast();
  const fail = useLoadFailure();
  const [site, setSite] = useState<SiteDraft | null>(null);
  const [types, setTypes] = useState<RoomType[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  /** which room type the next picture belongs to; null is the resort itself */
  const [attachTo, setAttachTo] = useState<number | null>(null);

  // the draft the owner is typing, kept apart from what is saved so a slow
  // network does not eat a keystroke
  const [draft, setDraft] = useState({ headline: "", intro: "", amenities: "", themeColor: "" });
  const [address, setAddress] = useState("");

  const load = useCallback(() => {
    api<SiteDraft>(`/resorts/${rid}/site`)
      .then((s) => {
        setSite(s);
        setDraft({
          headline: s.headline ?? "",
          intro: s.intro ?? "",
          amenities: s.amenities.join(", "),
          themeColor: s.themeColor ?? "",
        });
        setAddress(s.slug);
        fail.clear();
      })
      .catch(fail.onFail(() => setSite(null)));
    api<RoomType[]>(`/resorts/${rid}/room-types`)
      .then(setTypes)
      .catch(() => setTypes([]));
  }, [rid]);
  useEffect(() => load(), [load]);

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    try {
      await fn();
      push(ok);
      load();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(null);
    }
  }

  if (fail.error) return <LoadFailed error={fail.error} onRetry={load} />;
  if (!site) return <Empty msg="Loading…" />;

  const publicUrl = `${typeof window === "undefined" ? "" : window.location.origin}/r/${site.slug}`;

  const save = () =>
    run(
      "save",
      () =>
        api(`/resorts/${rid}/site`, {
          method: "PATCH",
          body: {
            headline: draft.headline,
            intro: draft.intro,
            amenities: draft.amenities
              .split(",")
              .map((a) => a.trim())
              .filter(Boolean),
            themeColor: draft.themeColor,
          },
        }),
      "Saved — your site is updated",
    );

  const pickTemplate = (template: string) =>
    run(`t${template}`, () => api(`/resorts/${rid}/site`, { method: "PATCH", body: { template } }), "Design changed");

  const togglePublished = () =>
    run(
      "publish",
      () => api(`/resorts/${rid}/site/publish`, { method: "POST", body: { published: !site.published } }),
      site.published ? "Your site is off the air" : "Your site is live",
    );

  const saveAddress = () =>
    run("address", () => api(`/resorts/${rid}/site/address`, { method: "POST", body: { slug: address } }), "Address changed");

  async function addPhoto(chosen: File) {
    await run(
      "photo",
      () =>
        upload(`/resorts/${rid}/site/photos`, chosen, {
          ...(attachTo != null ? { "x-room-type": String(attachTo) } : {}),
        }),
      "Picture added",
    );
    if (file.current) file.current.value = "";
  }

  const move = (id: number, to: number) =>
    run(`m${id}`, () => api(`/resorts/${rid}/site/photos/${id}`, { method: "PATCH", body: { sortOrder: to } }), "Moved");

  const remove = (id: number) =>
    run(`d${id}`, () => api(`/resorts/${rid}/site/photos/${id}`, { method: "DELETE" }), "Picture removed");

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <Card title="Your website">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-semibold text-brand-700 underline underline-offset-4"
                >
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
                <a href={publicUrl} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-slate-700">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {/* the public address is 404 until published, for the owner too;
                    the preview is the owner's own look before that */}
                {site.published
                  ? "Live. Anyone with the address can see it."
                  : "Not live yet — the address opens for everyone once you publish."}{" "}
                <a href={`/preview/resort/${rid}`} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 underline underline-offset-2">
                  Preview it
                </a>
              </p>
            </div>
            <Button onClick={togglePublished} loading={busy === "publish"} variant={site.published ? "ghost" : undefined}>
              {site.published ? "Take it down" : "Publish"}
            </Button>
          </div>
        </Card>

        <Card title="The design">
          <div className="grid gap-3 sm:grid-cols-3">
            {site.templates.map((t) => {
              const on = site.template === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => pickTemplate(t.key)}
                  disabled={busy === `t${t.key}`}
                  className={`rounded-xl px-4 py-3 text-left ring-1 ${on ? "bg-brand-50 ring-brand-500" : "ring-slate-200 hover:bg-slate-50"}`}
                >
                  <div className="text-sm font-semibold text-slate-900">{t.label}</div>
                  <div className="mt-1 text-xs leading-relaxed text-slate-500">{t.blurb}</div>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Changing the design keeps every word and picture — only the arrangement changes.
          </p>
        </Card>

        <Card title="What it says">
          <div className="space-y-3">
            <Field label="Headline">
              <Input
                value={draft.headline}
                maxLength={160}
                placeholder="Tea gardens, ten minutes from town"
                onChange={(e) => setDraft({ ...draft, headline: e.target.value })}
              />
            </Field>
            <Field label="About your resort">
              <textarea
                value={draft.intro}
                maxLength={4000}
                rows={5}
                placeholder="A paragraph or two. What is it like to be here?"
                onChange={(e) => setDraft({ ...draft, intro: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="What you offer" hint="Separated by commas — Wi-Fi, Parking, Breakfast">
              <Input
                value={draft.amenities}
                onChange={(e) => setDraft({ ...draft, amenities: e.target.value })}
              />
            </Field>
            <Field label="Your colour" hint="Used for headings and buttons">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={draft.themeColor || "#0f5132"}
                  onChange={(e) => setDraft({ ...draft, themeColor: e.target.value })}
                  className="h-9 w-14 cursor-pointer rounded border border-slate-300"
                />
                <Input
                  value={draft.themeColor}
                  placeholder="#0f5132"
                  onChange={(e) => setDraft({ ...draft, themeColor: e.target.value })}
                  className="!w-32"
                />
              </div>
            </Field>
            <Button onClick={save} loading={busy === "save"}>
              Save
            </Button>
          </div>
        </Card>

        <Card title={`Pictures (${site.photos.length})`}>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="This picture is of">
              <Select
                value={attachTo ?? ""}
                onChange={(e) => setAttachTo(e.target.value === "" ? null : Number(e.target.value))}
              >
                <option value="">The resort</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <input
              ref={file}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const chosen = e.target.files?.[0];
                if (chosen) void addPhoto(chosen);
              }}
            />
            <Button onClick={() => file.current?.click()} loading={busy === "photo"}>
              <UploadIcon className="mr-1.5 h-4 w-4" /> Add a picture
            </Button>
            <span className="text-xs text-slate-400">
              {size(site.storage.used)} of {size(site.storage.quota)} used
            </span>
          </div>

          {site.photos.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              No pictures yet. The first one becomes the cover.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {site.photos.map((p, i) => (
                <li key={p.id} className="flex items-center gap-3 rounded-lg p-2 ring-1 ring-slate-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.alt ?? ""} className="h-14 w-20 rounded object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-800">
                      {p.roomTypeId ? (types.find((t) => t.id === p.roomTypeId)?.name ?? "A room") : "The resort"}
                      {i === 0 && !p.roomTypeId && <span className="ml-2 text-xs text-slate-400">cover</span>}
                    </div>
                    <div className="truncate text-xs text-slate-400">{p.alt ?? "No caption"}</div>
                  </div>
                  {/* two arrows rather than a drag handle: this is a list of
                      seven things on a phone, and a handle that cannot be
                      dragged is a promise the screen does not keep */}
                  <button
                    onClick={() => move(p.id, i - 1)}
                    disabled={i === 0 || busy === `m${p.id}`}
                    className="text-slate-400 hover:text-slate-700 disabled:opacity-25"
                    aria-label="Move earlier"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => move(p.id, i + 1)}
                    disabled={i === site.photos.length - 1 || busy === `m${p.id}`}
                    className="text-slate-400 hover:text-slate-700 disabled:opacity-25"
                    aria-label="Move later"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => remove(p.id)}
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
      </div>

      <div className="space-y-4">
        <Card title="The address">
          <Field label="Your site lives at" hint="Letters, numbers and dashes">
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
          <Button
            onClick={saveAddress}
            loading={busy === "address"}
            disabled={address === site.slug}
            className="mt-3"
          >
            Change the address
          </Button>
          <p className="mt-2 text-xs text-slate-500">
            Anyone who has the old address will stop finding you, so change it before you share it.
          </p>
        </Card>

        <OwnDomains
          base={`/resorts/${rid}/domains`}
          example="skyecoresort.com"
          blurb={
            <>
              Point your own address at your site — <b>skyecoresort.com</b> instead of ours. You keep the address
              above as well; both work.
            </>
          }
        />

        <Card title="How guests reach you">
          <div className="space-y-3">
            <Field label="WhatsApp number">
              <Input
                defaultValue={site.whatsapp ?? ""}
                placeholder="8801700000000"
                onBlur={(e) =>
                  e.target.value !== (site.whatsapp ?? "") &&
                  run("wa", () => api(`/resorts/${rid}/site`, { method: "PATCH", body: { whatsapp: e.target.value } }), "Saved")
                }
              />
            </Field>
            <Field label="Facebook page">
              <Input
                defaultValue={site.facebook ?? ""}
                placeholder="https://facebook.com/…"
                onBlur={(e) =>
                  e.target.value !== (site.facebook ?? "") &&
                  run("fb", () => api(`/resorts/${rid}/site`, { method: "PATCH", body: { facebook: e.target.value } }), "Saved")
                }
              />
            </Field>
            <Field label="Instagram">
              <Input
                defaultValue={site.instagram ?? ""}
                placeholder="https://instagram.com/…"
                onBlur={(e) =>
                  e.target.value !== (site.instagram ?? "") &&
                  run("ig", () => api(`/resorts/${rid}/site`, { method: "PATCH", body: { instagram: e.target.value } }), "Saved")
                }
              />
            </Field>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Your phone number and address come from Resort info, so there is one place to change them.
          </p>
        </Card>

        <Card title="Where you are">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Latitude">
              <Input
                defaultValue={site.map?.lat ?? ""}
                inputMode="decimal"
                id="site-lat"
                placeholder="24.3065"
              />
            </Field>
            <Field label="Longitude">
              <Input
                defaultValue={site.map?.lng ?? ""}
                inputMode="decimal"
                id="site-lng"
                placeholder="91.7296"
              />
            </Field>
          </div>
          <Button
            className="mt-3"
            loading={busy === "map"}
            onClick={() => {
              const lat = (document.getElementById("site-lat") as HTMLInputElement | null)?.value ?? "";
              const lng = (document.getElementById("site-lng") as HTMLInputElement | null)?.value ?? "";
              void run(
                "map",
                () =>
                  api(`/resorts/${rid}/site`, {
                    method: "PATCH",
                    body: {
                      mapLat: lat === "" ? null : Number(lat),
                      mapLng: lng === "" ? null : Number(lng),
                    },
                  }),
                "Map point saved",
              );
            }}
          >
            Save the map point
          </Button>
          <p className="mt-2 text-xs text-slate-500">
            Open your resort in Google Maps, right-click the spot, and the two numbers are at the top.
          </p>
        </Card>

        <Card title="What guests cannot do here">
          <p className="text-sm text-slate-600">
            Your site shows what is free and what it costs, and then asks the guest to call you. It
            does not take bookings or payments — every booking still comes through you.
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Prices and rooms come from your own records, so they are always what the calendar says.
          </p>
        </Card>
      </div>
    </div>
  );
}
