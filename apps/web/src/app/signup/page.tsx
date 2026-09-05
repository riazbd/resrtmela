"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, setToken } from "@/lib/api";
import { Button, Input } from "@/components/ui";

interface SignupResult {
  accessToken: string;
}

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [companyName, setCompanyName] = useState("");
  const [resortName, setResortName] = useState("");
  const [location, setLocation] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
          phone,
          password,
          slug: effectiveSlug || undefined,
        },
      });
      setToken(res.accessToken);
      router.replace("/dashboard");
    } catch (ex) {
      setErr((ex as Error).message);
      setBusy(false);
    }
  }

  const step1Ok = companyName.trim() && resortName.trim() && effectiveSlug.length >= 3;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 via-brand-700 to-emerald-600 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">R</div>
          <h1 className="text-xl font-bold text-slate-900">Create your workspace</h1>
          <p className="mt-1 text-xs text-slate-500">Step {step} of 3 · Free plan, 10 rooms, no card needed</p>
        </div>

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
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Sky Eco Group" autoFocus />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">First resort name</label>
                <Input value={resortName} onChange={(e) => setResortName(e.target.value)} placeholder="Sky Eco Resort" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Location (optional)</label>
                <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Sylhet, Bangladesh" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Workspace URL</label>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-400">resortmela.app/</span>
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
              <Button type="button" className="w-full" disabled={!name || phone.length < 10 || password.length < 8} onClick={() => setStep(3)}>
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
                  <span className="text-slate-400">Admin:</span> {name} · {phone}
                </div>
                <div className="text-xs">
                  <span className="text-slate-400">Plan:</span> Free (10 rooms per resort)
                </div>
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
