"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Button, Input } from "@/components/ui";
import { BedDouble, CalendarDays, ShieldCheck, UtensilsCrossed, ArrowLeft } from "lucide-react";
import { landingFor } from "@/lib/console-access";

const HIGHLIGHTS = [
  { icon: CalendarDays, text: "Booking calendar with one-click reservations" },
  { icon: BedDouble, text: "Front desk, dues & guest history" },
  { icon: UtensilsCrossed, text: "Restaurant POS with room tabs" },
  { icon: ShieldCheck, text: "Agents, wallets & role-based access" },
];

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
              <label className="text-xs font-semibold text-slate-600">Password</label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {err && (
              <div className="rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-700 ring-1 ring-red-200">
                {err}
              </div>
            )}
            <Button type="submit" loading={busy} className="!w-full !py-2.5">
              Sign in
            </Button>
          </form>
          <div className="mt-6 rounded-xl bg-brand-50 px-4 py-3.5 text-xs leading-relaxed text-brand-800">
            <b>Guest?</b> You don&apos;t need an account to book.{" "}
            <Link href="/book" className="font-bold underline underline-offset-2">
              Browse resorts & book here
            </Link>
            .
          </div>
          <p className="mt-6 text-center text-[11px] text-slate-400">
            Staff, manager & agent sign-in · Resort Mela platform
          </p>
        </div>
      </div>
    </main>
  );
}
