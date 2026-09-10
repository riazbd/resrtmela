"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Button, Input } from "@/components/ui";
import { newPasswordError } from "@/lib/password-reset";
import { ArrowLeft } from "lucide-react";

function ResetInner() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const problem = newPasswordError(password, confirmation);
    if (problem) {
      setErr(problem);
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      await api("/auth/password/reset", { method: "POST", body: { token, password } });
      router.replace("/login?reset=1");
    } catch (ex) {
      // the API's own message names the actual problem (expired, used, unknown
      // token) — a generic "something went wrong" would hide the fix, which is
      // to ask for a new link
      setErr((ex as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/login" className="mb-8 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-brand-700">
          <ArrowLeft className="h-4 w-4" /> Back to sign in
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Set a new password</h1>
        <p className="mt-1 text-sm text-slate-500">Choose a new password for your account</p>

        {!token && (
          <div className="mt-4 rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-700 ring-1 ring-red-200">
            This link is missing its token. Ask for a new one from the sign-in page.
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">New password</label>
            <Input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Confirm password</label>
            <Input
              type="password"
              placeholder="••••••••"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              required
            />
          </div>
          {err && (
            <div className="rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-700 ring-1 ring-red-200">
              {err}
            </div>
          )}
          <Button type="submit" loading={busy} disabled={!token} className="!w-full !py-2.5">
            Set new password
          </Button>
        </form>
      </div>
    </main>
  );
}

export default function ResetPage() {
  // useSearchParams() opts this route out of static prerendering unless it is
  // wrapped in Suspense — without it `next build` fails, it does not just warn
  return (
    <Suspense fallback={null}>
      <ResetInner />
    </Suspense>
  );
}
