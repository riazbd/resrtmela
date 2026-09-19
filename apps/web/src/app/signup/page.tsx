"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { RegisterAs } from "@/components/register-as";
import { useRouter } from "next/navigation";
import { client, API_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { landingFor } from "@/lib/console-access";
import { Button, Input } from "@/components/ui";
import { emailError, phoneError } from "@/lib/contact";
import { OfferBanner, offerLine, useOffer } from "./offer";
import { plannedPlan, plannedShelf } from "../(public)/signup-href";
import { formatMoney, scheduleSentence, type Phase } from "@rh/shared";
import { LogoMark } from "@/components/logo";

interface SignupResult {
  accessToken: string;
}

/**
 * One row of the public price list — the same rows Platform → Plans edits.
 *
 * There is no `active` here: `/cms/plans` returns what is on sale and nothing
 * else. This page used to read one, and `plans.find(p => p.active)` was
 * therefore always undefined — so the plan a new workspace starts on printed
 * as "—" on the summary step, and the header line quoting it was blank.
 */
interface PublicPlan {
  name: string;
  label: string;
  maxRooms: number;
  trialDays: number;
  /** Every way this plan is sold; the card the visitor pressed named one. */
  schedules: { id: number; label: string; phases: Phase[]; openingFee: number }[];
}

export default function SignupPage() {
  const router = useRouter();
  const { adoptToken } = useAuth();
  const [step, setStep] = useState(1);
  const [companyName, setCompanyName] = useState("");
  const [resortName, setResortName] = useState("");
  const [location, setLocation] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [plans, setPlans] = useState<PublicPlan[] | null>(null);
  const offer = useOffer("RESORT");
  /**
   * The offer code, carried when switching to the other form.
   *
   * `useOffer` already refuses a code meant for the other audience and says so
   * — which is the case where switching form is exactly what the visitor
   * should do, and arriving there without the code would cost them the offer.
   */
  const offerSearch = offer.code ? `?offer=${encodeURIComponent(offer.code)}` : "";
  const usingOffer = !!offer.offer?.usable && !offer.problem;
  // this deployment's own host, not a domain compiled into the page. Read
  // after mounting, not during render: the server has no `window`, so
  // rendering it inline made the server's HTML and the client's first render
  // disagree, and React threw the whole tree away and built it again.
  const [workspaceHost, setWorkspaceHost] = useState("");
  useEffect(() => setWorkspaceHost(window.location.host), []);

  /**
   * `?schedule=7`, from the card the visitor pressed.
   *
   * This was `?billing=YEARLY`, a single bit, because monthly and yearly were
   * the only two ways anything could be sold. It names a `PlanSchedule` now,
   * so somebody who pressed a card reading "Free for a week, then ৳500 a
   * month" signs up on exactly that and not on something adjacent to it.
   *
   * Read after mounting for the same reason `window.location.host` is: the
   * server has no query string of its own here, and reading one during render
   * makes the first client render disagree with the server's HTML.
   */
  const [pickedSchedule, setPickedSchedule] = useState<number | null>(null);
  /**
   * `?plan=CHAIN`, from the card that was clicked.
   *
   * Read here for the same reason `schedule` is, and it is the same trip: the
   * two travel together from the pricing page, and until today only one of
   * them was picked up. A workspace that chose Chain opened on Starter.
   */
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const asked = Number(q.get("schedule"));
    setPickedSchedule(Number.isInteger(asked) && asked > 0 ? asked : null);
    setPicked(q.get("plan"));
  }, []);

  useEffect(() => {
    fetch(`${API_URL}/cms/plans`)
      .then((r) => r.json())
      .then((d) => setPlans(Array.isArray(d) ? d : []))
      .catch(() => setPlans([]));
  }, []);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // the onboarding question (2026-09-11 design, §8.4): asked, never defaulted
  const [liveAgencies, setLiveAgencies] = useState<number | null>(null);
  useEffect(() => {
    fetch(`${API_URL}/cms/agencies/count`)
      .then((r) => r.json())
      .then((d: { agencies?: number }) => setLiveAgencies(typeof d.agencies === "number" ? d.agencies : null))
      .catch(() => setLiveAgencies(null));
  }, []);

  const autoSlug = useMemo(
    () =>
      companyName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60),
    [companyName],
  );
  const effectiveSlug = slugTouched ? slug : autoSlug;

  function slugifyLocal(s: string) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await client.auth.signup({
          companyName,
          resortName,
          location: location || undefined,
          name,
          email,
          phone,
          password,
          slug: effectiveSlug || undefined,
          offer: usingOffer ? (offer.code ?? undefined) : undefined,
          // the plan card that was clicked — sent as the form described it, so
          // what the visitor read while typing is what the workspace opens on.
          // An offer names its own plan and wins; the API decides that.
          plan: entry?.name ?? undefined,
          // which rhythm was picked on the pricing page. The API checks it
          // against the plan and falls back to monthly rather than refusing,
          // so a stale link cannot cost somebody their signup.
          scheduleId: shelf?.id,
      });
      // adoptToken loads /auth/me and activates the first resort — the same
      // thing login does after its own POST. Without it the console's own
      // AuthProvider never learns who just signed up, and consoleGate (which
      // only knows `me` from that provider) sends the brand-new owner
      // straight back to /login.
      const me = await adoptToken(res.accessToken);
      router.replace(landingFor(me.role));
    } catch (ex) {
      setErr((ex as Error).message);
      setBusy(false);
    }
  }

  const step1Ok = companyName.trim() && resortName.trim() && effectiveSlug.length >= 3;

  /**
   * The plan a new workspace actually starts on.
   *
   * This copy said "Free plan, 10 rooms" in two places. `signup` picks the
   * entry plan out of `platform_plans` — it has since the plan vocabulary was
   * unified — so the page was describing a plan the platform may no longer
   * sell, at a room cap it may no longer have.
   */
  // the plan the pricing card named, or the first row of the price list — which
  // the API already orders and filters — when the visitor arrived without one
  const entry = plannedPlan(plans, picked);
  // the shelf they arrived on, or picked below, or the plan's first
  const shelf = plannedShelf(entry, pickedSchedule);
  /**
   * What they are agreeing to, in full — the ladder included.
   *
   * A summary that named only the opening price would be the renewal-shock
   * complaint in miniature, on the one screen where somebody is actually
   * deciding.
   */
  const money = (n: number) => formatMoney(n, { currency: "BDT", locale: "en-IN" });
  const priceLine = shelf ? scheduleSentence(shelf.phases, money) : "";
  const entryLine = usingOffer
    ? offerLine(offer.offer!)
    : entry
      ? `${entry.label} · ${entry.maxRooms >= 1000 ? "unlimited rooms" : `${entry.maxRooms} rooms`}${priceLine ? ` · ${priceLine}` : ""}${entry.trialDays ? ` · ${entry.trialDays} days free` : ""}`
      : "";

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 via-brand-700 to-emerald-600 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <LogoMark size={44} className="mx-auto mb-2" />
          <h1 className="text-xl font-bold text-slate-900">Create your workspace</h1>
          <p className="mt-1 text-xs text-slate-500">Step {step} of 3{entryLine ? ` · ${entryLine}` : ""} · no card needed</p>
        </div>

        {/* the small grey "A travel agency?" line used to live under the title;
            a choice the platform's two customers both have to make belongs at
            the top of the form, not at the bottom of the header */}
        {step === 1 && <RegisterAs current="resort" search={offerSearch} />}
        <OfferBanner state={offer} />
        <div className="mb-6 flex gap-1.5">
          {[1, 2, 3].map((n) => (
            <div key={n} className={`h-1 flex-1 rounded-full ${n <= step ? "bg-brand-500" : "bg-slate-200"}`} />
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          {step === 1 && (
            <>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Company / group name</label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. Sundarban Group" autoFocus />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">First resort name</label>
                <Input value={resortName} onChange={(e) => setResortName(e.target.value)} placeholder="e.g. Sundarban Retreat" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Location (optional)</label>
                <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Sylhet, Bangladesh" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Workspace URL</label>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-400">{workspaceHost}/</span>
                  <Input
                    value={effectiveSlug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setSlug(slugifyLocal(e.target.value));
                    }}
                    placeholder="sundarban-group"
                  />
                </div>
              </div>
              <Button type="button" className="w-full" disabled={!step1Ok} onClick={() => setStep(2)}>
                Continue
              </Button>
            </>
          )}

          {step === 2 && (
            <>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Your name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Md. Rahman" autoFocus />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Email (login)</label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Mobile (login)</label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Password</label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min 8 characters" />
              </div>
              {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">{err}</div>}
              <Button type="button" variant="ghost" className="w-full" onClick={() => setStep(1)}>
                ← Back
              </Button>
              <Button
                type="button"
                className="w-full"
                disabled={!name || !!emailError(email) || !!phoneError(phone) || password.length < 8}
                onClick={() => setStep(3)}
              >
                Continue
              </Button>
            </>
          )}

          {step === 3 && (
            <>
              <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700 ring-1 ring-slate-200">
                <div className="font-semibold">{companyName}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {resortName}
                  {location ? ` · ${location}` : ""}
                </div>
                <div className="mt-2 text-xs">
                  <span className="text-slate-400">Admin:</span> {name} · {email} · {phone}
                </div>
                <div className="text-xs">
                  <span className="text-slate-400">Plan:</span> {entryLine || "—"}
                </div>
              </div>

              {/*
                * The plan, chosen here rather than assumed.
                *
                * Arriving without one used to mean the first row of the price
                * list, silently — so what a workspace could do on its first day
                * was decided by a `sortOrder` nobody on this screen could see.
                * The list is the platform's own, live from `/cms/plans`, so
                * adding a plan or reordering the shelf changes this form with
                * no deploy. An offer names its own plan and the API enforces
                * that, so there is nothing to choose while one is in hand.
                */}
              {!usingOffer && plans && plans.length > 1 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-slate-600">Choose your plan</div>
                  <div className="grid gap-2">
                    {plans.map((p) => {
                      const on = entry?.name === p.name;
                      const rate = plannedShelf(p, on ? pickedSchedule : null);
                      return (
                        <button
                          key={p.name}
                          type="button"
                          onClick={() => {
                            setPicked(p.name);
                            // the shelf belongs to the plan being left; the
                            // new plan's own first shelf takes over
                            setPickedSchedule(null);
                          }}
                          className={`rounded-xl px-3 py-2 text-left ring-1 ${on ? "bg-brand-50 ring-brand-500" : "ring-slate-200 hover:bg-slate-50"}`}
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-sm font-semibold text-slate-900">{p.label}</span>
                            <span className="text-xs text-slate-500">
                              {p.maxRooms >= 1000 ? "unlimited rooms" : `${p.maxRooms} rooms`}
                            </span>
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500">
                            {rate ? scheduleSentence(rate.phases, money) : "—"}
                            {p.trialDays ? ` · ${p.trialDays} days free` : ""}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/*
                    * And how to buy it, when the owner sells this plan more
                    * than one way. One shelf is not a choice, so it is not
                    * drawn as one.
                    */}
                  {entry && entry.schedules.length > 1 && (
                    <div className="grid grid-cols-2 gap-2">
                      {entry.schedules.map((sch) => (
                        <button
                          key={sch.id}
                          type="button"
                          onClick={() => setPickedSchedule(sch.id)}
                          className={`rounded-lg px-3 py-2 text-xs font-semibold ring-1 ${shelf?.id === sch.id ? "bg-brand-600 text-white ring-brand-600" : "text-slate-700 ring-slate-300 hover:bg-slate-50"}`}
                        >
                          {sch.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {/*
                * This used to be a question, with the submit button dead until
                * it was answered — the first opinion a new customer was asked
                * for, about a part of the business they had not seen yet, and
                * the answer that starts a resort closed for good. Whether
                * agencies sell here follows from the plan now, so this says
                * what is about to be true rather than asking.
                */}
              <div className="rounded-xl p-4 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">Travel agencies can sell your rooms</div>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  A travel agency books rooms for its own clients and earns a commission from you on each booking — a
                  percentage of the rent you set, paid only when it brings a guest. Every agency here is verified by the
                  platform before it can sell.
                  {liveAgencies != null && (
                    <>
                      {" "}<b className="text-slate-700">{liveAgencies} verified {liveAgencies === 1 ? "agency is" : "agencies are"}</b> selling right now.
                    </>
                  )}{" "}
                  You can block any one of them in Settings, and set a different commission for any of them.
                </p>
              </div>
              {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">{err}</div>}
              <Button type="button" variant="ghost" className="w-full" onClick={() => setStep(2)}>
                ← Back
              </Button>
              <Button type="submit" className="w-full" loading={busy}>
                Create workspace & sign in
              </Button>
              <p className="text-center text-[11px] text-slate-400">
                Next: add rooms or import your existing booking sheet
              </p>
            </>
          )}
        </form>

        <p className="mt-6 text-center text-[11px] text-slate-400">
          Already onboarded?{" "}
          <a href="/login" className="text-brand-600 hover:underline">Sign in</a>
        </p>
      </div>
    </main>
  );
}
