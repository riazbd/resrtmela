"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, API_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { landingFor } from "@/lib/console-access";
import { Button, Input } from "@/components/ui";
import { emailError, phoneError } from "@/lib/contact";
import { OfferBanner, offerLine, useOffer } from "./offer";
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
  const usingOffer = !!offer.offer?.usable && !offer.problem;
  // this deployment's own host, not a domain compiled into the page. Read
  // after mounting, not during render: the server has no `window`, so
  // rendering it inline made the server's HTML and the client's first render
  // disagree, and React threw the whole tree away and built it again.
  const [workspaceHost, setWorkspaceHost] = useState("");
  useEffect(() => setWorkspaceHost(window.location.host), []);

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
  const [agentsOpen, setAgentsOpen] = useState<boolean | null>(null);
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
      const res = await api<SignupResult>("/auth/signup", {
        method: "POST",
        body: {
          companyName,
          resortName,
          location: location || undefined,
          name,
          email,
          phone,
          password,
          slug: effectiveSlug || undefined,
          offer: usingOffer ? offer.code : undefined,
          agentsOpen: agentsOpen === true,
        },
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
  // the first row of the price list, which the API already orders and filters
  const entry = plans?.[0] ?? null;
  // an offer names the plan the workspace lands on
  const entryLine = usingOffer
    ? offerLine(offer.offer!)
    : entry
      ? `${entry.label} · ${entry.maxRooms >= 1000 ? "unlimited rooms" : `${entry.maxRooms} rooms`}${entry.trialDays ? ` · ${entry.trialDays} days free` : ""}`
      : "";

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 via-brand-700 to-emerald-600 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <LogoMark size={44} className="mx-auto mb-2" />
          <h1 className="text-xl font-bold text-slate-900">Create your workspace</h1>
          <p className="mt-1 text-xs text-slate-500">Step {step} of 3{entryLine ? ` · ${entryLine}` : ""} · no card needed</p>
          <p className="mt-1 text-[11px] text-slate-400">
            A travel agency? <a href="/signup/agency" className="font-semibold text-brand-700 hover:underline">Sign up as an agency</a>
          </p>
        </div>

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
                <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Sylhet, Bangladesh" />
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
                    placeholder="sky-eco-group"
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
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Md. Rahman" autoFocus />
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
              <div className="rounded-xl p-4 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">Will travel agencies sell your rooms?</div>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  A travel agency books rooms for its own clients and earns a commission from you on each booking — a
                  percentage of the rent you set, paid only when it brings a guest. Every agency here is verified by the
                  platform before it can sell.
                  {liveAgencies != null && (
                    <>
                      {" "}<b className="text-slate-700">{liveAgencies} verified {liveAgencies === 1 ? "agency is" : "agencies are"}</b> selling right now.
                    </>
                  )}{" "}
                  You can block any one of them, or change your mind, in Settings.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAgentsOpen(true)}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold ring-1 ${agentsOpen === true ? "bg-brand-600 text-white ring-brand-600" : "text-slate-700 ring-slate-300 hover:bg-slate-50"}`}
                  >
                    Yes, open to agencies
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgentsOpen(false)}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold ring-1 ${agentsOpen === false ? "bg-slate-700 text-white ring-slate-700" : "text-slate-700 ring-slate-300 hover:bg-slate-50"}`}
                  >
                    Not now
                  </button>
                </div>
              </div>
              {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">{err}</div>}
              <Button type="button" variant="ghost" className="w-full" onClick={() => setStep(2)}>
                ← Back
              </Button>
              <Button type="submit" className="w-full" loading={busy} disabled={agentsOpen === null}>
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
