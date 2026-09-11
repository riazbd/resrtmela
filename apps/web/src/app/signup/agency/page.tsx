"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, API_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { landingFor } from "@/lib/console-access";
import { Button, Input } from "@/components/ui";
import { emailError, phoneError } from "@/lib/contact";

/** One plan from the agency shelf — never a resort plan. */
interface AgencyPlan {
  name: string;
  label: string;
  monthlyFee: number;
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

  useEffect(() => {
    fetch(`${API_URL}/cms/plans?audience=AGENCY`)
      .then((r) => r.json())
      .then((d: AgencyPlan[]) => {
        const list = Array.isArray(d) ? d : [];
        setPlans(list);
        if (list[0]) setPlan(list[0].name);
      })
      .catch(() => setPlans([]));
  }, []);

  const problem =
    (!agencyName.trim() && "Enter your agency's name") ||
    (!name.trim() && "Enter your name") ||
    emailError(email) ||
    phoneError(phone) ||
    (password.length < 8 && "Password must be at least 8 characters") ||
    (!plan && "Choose a plan");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (problem) return;
    setErr(null);
    setBusy(true);
    try {
      const res = await api<{ accessToken: string }>("/auth/signup/agency", {
        method: "POST",
        body: { agencyName, name, email, phone, password, plan },
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
          <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">R</div>
          <h1 className="text-xl font-bold text-slate-900">Sign up your travel agency</h1>
          <p className="mt-1 text-xs text-slate-500">
            Verified once by Resort Mela, then sell every resort that is open to agents.
          </p>
        </div>

        {plans && plans.length === 0 ? (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            Agency plans are not on sale yet. Please check back soon.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Agency name</label>
              <Input value={agencyName} onChange={(e) => setAgencyName(e.target.value)} placeholder="e.g. Sea Breeze Travels" autoFocus />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Your name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Md. Rahman" />
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
            <div className="space-y-1">
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
