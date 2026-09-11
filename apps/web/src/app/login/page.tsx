"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Button, Input } from "@/components/ui";
import { BedDouble, CalendarDays, ShieldCheck, UtensilsCrossed, ArrowLeft } from "lucide-react";
import { landingFor } from "@/lib/console-access";
import { RESET_REQUESTED_MESSAGE } from "@/lib/password-reset";

const HIGHLIGHTS = [
  { icon: CalendarDays, text: "Booking calendar with one-click reservations" },
  { icon: BedDouble, text: "Front desk, dues & guest history" },
  { icon: UtensilsCrossed, text: "Restaurant POS with room tabs" },
  { icon: ShieldCheck, text: "Agents, wallets & role-based access" },
];

function LoginInner() {
  const { login } = useAuth();
  const router = useRouter();
  // reset=1 is only ever set by our own redirect from /reset on success
  const justReset = useSearchParams().get("reset") === "1";
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const me = await login(phone, password);
      // "/dashboard" for everyone sent the platform owner into somebody else's
      // resort, and an agent to a page their permissions refuse
      router.replace(landingFor(me.role));
    } catch (ex) {
      setErr((ex as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // not a nested <form> — the small "forgot password" panel sits inside the
  // sign-in <form>, and HTML does not allow a form within a form
  async function submitForgot() {
    setForgotBusy(true);
    try {
      await api("/auth/password/forgot", { method: "POST", body: { identifier: forgotIdentifier } });
    } catch {
      // the endpoint deliberately never reveals whether the address has an
      // account (Task 1); a network failure here gets the same one sentence
      // rather than a different message that would itself leak information
    } finally {
      setForgotBusy(false);
      setForgotSent(true);
    }
  }

  return (
    <main className="flex min-h-screen bg-white">
      {/* brand panel */}
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-700 via-brand-800 to-brand-900 p-10 text-white lg:flex">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/5 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-emerald-300/10 blur-2xl" />
        <Link href="/" className="relative flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 font-bold backdrop-blur">R</div>
          <div>
            <div className="text-sm font-bold leading-tight">Resort Mela</div>
            <div className="text-[10px] text-brand-200">Resort management platform</div>
          </div>
        </Link>
        <div className="relative">
          <h2 className="max-w-md text-4xl font-black leading-tight">
            Run your resort from one screen.
          </h2>
          <ul className="mt-8 space-y-3.5">
            {HIGHLIGHTS.map((h) => (
              <li key={h.text} className="flex items-center gap-3 text-sm text-brand-50/90">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
                  <h.icon className="h-4 w-4" />
                </span>
                {h.text}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative text-xs text-brand-200/70">
          © {new Date().getFullYear()} Resort Mela — bookings, kitchen, agents & money in one place
        </div>
      </div>

      {/* form panel */}
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-brand-700 lg:hidden">
            <ArrowLeft className="h-4 w-4" /> Resort Mela
          </Link>
          <div className="mb-7 hidden lg:block">
            <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-brand-700">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to homepage
            </Link>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Welcome back</h1>
            <p className="mt-1 text-sm text-slate-500">Sign in to your resort console</p>
          </div>
          {justReset && (
            <div className="mb-4 rounded-lg bg-emerald-50 px-3 py-2.5 text-xs text-emerald-700 ring-1 ring-emerald-200">
              Password updated. Sign in with your new password.
            </div>
          )}
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Phone or email</label>
              <Input
                placeholder="01XXXXXXXXX or you@email.com"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoFocus
                required
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-600">Password</label>
                <button
                  type="button"
                  className="text-xs font-medium text-brand-600 hover:underline"
                  onClick={() => {
                    setShowForgot((v) => !v);
                    setForgotSent(false);
                  }}
                >
                  Forgot password?
                </button>
              </div>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {showForgot && (
              <div className="space-y-2 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
                {forgotSent ? (
                  <p className="text-xs text-slate-600">{RESET_REQUESTED_MESSAGE}</p>
                ) : (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-600">
                      Email or phone
                    </label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="01XXXXXXXXX or you@email.com"
                        value={forgotIdentifier}
                        onChange={(e) => setForgotIdentifier(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void submitForgot();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        loading={forgotBusy}
                        disabled={!forgotIdentifier}
                        onClick={() => void submitForgot()}
                      >
                        Send
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {err && (
              <div className="rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-700 ring-1 ring-red-200">
                {err}
              </div>
            )}
            <Button type="submit" loading={busy} className="!w-full !py-2.5">
              Sign in
            </Button>
          </form>
          <p className="mt-6 text-center text-[11px] text-slate-400">
            Staff, manager & agent sign-in · Resort Mela platform
          </p>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  // useSearchParams() (for the post-reset banner) opts this route out of
  // static prerendering unless it is wrapped in Suspense — same reason /reset
  // and /bookings need it, and the same failure mode: next build, not a warning
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
