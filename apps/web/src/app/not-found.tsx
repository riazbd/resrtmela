"use client";

import Link from "next/link";
import { landingFor } from "@/lib/console-access";
import { useAuth } from "@/lib/auth";

/**
 * A wrong URL should offer a way out, not a stack trace or an empty page.
 *
 * The way out is *this person's* way out. It was "Back to the Day Sheet" for
 * everybody until 2026-09-28 — a resort screen, offered to an agency that has
 * no day sheet and is refused by the one it was sent to, and to a signed-out
 * visitor who would be bounced to the sign-in page. A 404 whose only button
 * leads to a second refusal is a dead end with a door painted on it.
 *
 * `landingFor` is the same rule that decides where signing in lands, so the
 * two cannot come to disagree about where somebody belongs.
 */
export default function NotFound() {
  const { me, loading } = useAuth();
  const to = me ? landingFor(me.role) : "/login";
  const label = me
    ? "কনসোলে ফিরে যান · Back to the console"
    : "সাইন ইন করুন · Sign in";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-5xl font-black text-slate-200">404</p>
      <div>
        <h1 className="text-lg font-bold text-slate-900" lang="bn">পাতাটি খুঁজে পাওয়া যায়নি</h1>
        <p className="text-sm text-slate-500">This page does not exist.</p>
      </div>
      {/* while the session is still loading there is no honest destination to
          name, so the button waits rather than naming the wrong one */}
      {loading ? null : (
        <Link
          href={to}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
        >
          {label}
        </Link>
      )}
    </div>
  );
}
