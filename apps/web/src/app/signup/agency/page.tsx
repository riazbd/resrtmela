"use client";

import { FormEvent, useEffect, useState } from "react";
import { RegisterAs } from "@/components/register-as";
import { useRouter } from "next/navigation";
import { api, API_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { landingFor } from "@/lib/console-access";
import { Button, Input } from "@/components/ui";
import { emailError, phoneError } from "@/lib/contact";
import { OfferBanner, useOffer } from "../offer";
import { LogoMark } from "@/components/logo";

/** One plan from the agency shelf — never a resort plan. */
interface AgencyPlan {
  name: string;
  label: string;
  monthlyFee: number;
  /** null where this plan is sold by the month only. */
  yearlyFee: number | null;
  yearlySaving: { pct: number; monthsFree: number; amount: number } | null;
  trialDays: number;
  blurb: string | null;
}

/**
 * An agency's front door.
 *
 * There was none: an agency existed only because a resort invited it. This is
 * the mirror of resort signup — the owner asked for exactly that — and it lands
 * the agency pending, on a trial of the plan it chose. The platform verifies it
 * once; after that it can sell every resort that is open to agents.
 */
export default function AgencySignupPage() {
  const router = useRouter();
  const { adoptToken } = useAuth();
  const [plans, setPlans] = useState<AgencyPlan[] | null>(null);
  const [plan, setPlan] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const offer = useOffer("AGENCY");
  /**
   * The offer code, carried when switching to the other form.
   *
   * `useOffer` already refuses a code meant for the other audience and says so
   * — which is the case where switching form is exactly what the visitor
   * should do, and arriving there without the code would cost them the offer.
   */
  const offerSearch = offer.code ? `?offer=${encodeURIComponent(offer.code)}` : "";

  /**
   * The plan and the rhythm the pricing page was showing when the visitor
   * pressed the button. Read after mounting, like every other query-string
   * read on these pages: the server renders without one, and reading it during
   * render makes the first client render disagree with the server's HTML.
   */
  const [yearly, setYearly] = useState(false);
  const [wanted, setWanted] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setYearly(q.get("billing") === "YEARLY");
    setWanted(q.get("plan"));
  }, []);

  useEffect(() => {
    fetch(`${API_URL}/cms/plans?audience=AGENCY`)
      .then((r) => r.json())
      .then((d: AgencyPlan[]) => {
        const list = Array.isArray(d) ? d : [];
        setPlans(list);
        // the plan they clicked, if it is still on sale; otherwise the first
        const asked = wanted && list.some((p) => p.name === wanted) ? wanted : list[0]?.name;
        if (asked) setPlan(asked);
      })
      .catch(() => setPlans([]));
  }, [wanted]);

  const chosen = (plans ?? []).find((p) => p.name === plan) ?? null;
  // a plan with no yearly price cannot be bought by the year, whatever the link said
  const onYear = yearly && chosen?.yearlyFee != null;

  // an offer names the plan, so there is nothing to choose
  const usingOffer = !!offer.offer?.usable && !offer.problem;
  const problem =
    (!agencyName.trim() && "Enter your agency's name") ||
    (!name.trim() && "Enter your name") ||
    emailError(email) ||
    phoneError(phone) ||
    (password.length < 8 && "Password must be at least 8 characters") ||
    (!usingOffer && !plan && "Choose a plan");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (problem) return;
    setErr(null);
    setBusy(true);
    try {
      const res = await api<{ accessToken: string }>("/auth/signup/agency", {
        method: "POST",
        body: usingOffer
          ? { agencyName, name, email, phone, password, offer: offer.code, billingCycle: onYear ? "YEARLY" : "MONTHLY" }
          : { agencyName, name, email, phone, password, plan, billingCycle: onYear ? "YEARLY" : "MONTHLY" },
      });
      const me = await adoptToken(res.accessToken);
      router.replace(landingFor(me.role));
    } catch (ex) {
      setErr((ex as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 via-brand-700 to-emerald-600 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <LogoMark size={44} className="mx-auto mb-2" />
          <h1 className="text-xl font-bold text-slate-900">Sign up your travel agency</h1>
          <p className="mt-1 text-xs text-slate-500">
            Verified once by Resort Mela, then sell every resort that is open to agents.
          </p>
        </div>

        <RegisterAs current="agency" search={offerSearch} />
        <OfferBanner state={offer} />
        {plans && plans.length === 0 && !usingOffer ? (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            Agency plans are not on sale yet. Please check back soon.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Agency name</label>
              <Input value={agencyName} onChange={(e) => setAgencyName(e.target.value)} placeholder="e.g. Meghna Tours & Travels" autoFocus />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Your name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Md. Rahman" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Email (login)</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@agency.com" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Mobile (login)</label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Password</label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min 8 characters" />
            </div>
            <div className="space-y-1" hidden={usingOffer}>
              <label className="text-xs font-medium text-slate-600">Plan</label>
              <select
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {(plans ?? []).map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.label} — ৳{p.monthlyFee.toLocaleString("en-IN")}/month{p.trialDays ? ` · ${p.trialDays} days free` : ""}
                  </option>
                ))}
              </select>

              {/* Pay by the year, where this plan is sold that way. The saving
                  is spelled out in taka as well as a percentage — a percentage
                  of an unstated number is not something anyone can decide on. */}
              {chosen?.yearlyFee != null && (
                <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-lg bg-slate-50 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={onYear}
                    onChange={() => setYearly(!onYear)}
                    className="mt-0.5 h-4 w-4 accent-brand-600"
                  />
                  <span className="text-xs text-slate-600">
                    Pay for a year — ৳{chosen.yearlyFee.toLocaleString("en-IN")}
                    {chosen.yearlySaving && (
                      <b className="text-emerald-700">
                        {" "}save ৳{chosen.yearlySaving.amount.toLocaleString("en-IN")} ({chosen.yearlySaving.pct}%)
                      </b>
                    )}
                    <span className="block text-[11px] text-slate-400">
                      ৳{Math.round(chosen.yearlyFee / 12).toLocaleString("en-IN")} a month, billed yearly
                    </span>
                  </span>
                </label>
              )}
            </div>
            {err && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{err}</p>}
            <Button type="submit" className="w-full" loading={busy} disabled={!!problem}>
              Create agency account
            </Button>
            {problem && <p className="text-center text-[11px] text-slate-400">{problem}</p>}
          </form>
        )}
        <p className="mt-5 text-center text-xs text-slate-500">
          Running a resort instead? <a href="/signup" className="font-semibold text-brand-700 hover:underline">Create a resort workspace</a>
          {" · "}
          <a href="/login" className="font-semibold text-brand-700 hover:underline">Sign in</a>
        </p>
      </div>
    </main>
  );
}
