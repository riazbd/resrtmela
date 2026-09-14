"use client";

/**
 * Your own account, in every panel.
 *
 * There was nowhere to change your own password. `POST /auth/me/password` had
 * existed all along with no screen calling it, so the only way back into your
 * own account was to sign out, press "Forgot password?", and wait for an email
 * — from inside a console you were already signed in to.
 *
 * It lives outside the sidebar's navigation on purpose. Every entry there is
 * filtered by role, permission and plan; this one belongs to whoever is signed
 * in, whatever they are — resort staff, an agency, the platform's own owner —
 * so it hangs off the footer beside their name and answers to nobody's
 * permission at all.
 */

import { useAuth } from "@/lib/auth";
import { ChangeMyPassword } from "@/components/set-password";
import { Card } from "@/components/ui";
import { displayEmail, displayPhone } from "@/lib/contact";

export default function AccountPage() {
  const { me, role } = useAuth();

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Account</h1>
        <p className="text-xs text-slate-500">How you sign in.</p>
      </div>

      <Card title="You">
        <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Name</dt>
            <dd className="text-slate-800">{me?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Role</dt>
            <dd className="text-slate-800">{role.replace(/_/g, " ")}</dd>
          </div>
          {/* both, because either one signs you in, and a placeholder is shown
              as "not set" rather than as the fake value standing in for it */}
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Email</dt>
            <dd className="text-slate-800">{displayEmail(me?.email ?? null)}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Phone</dt>
            <dd className="text-slate-800">{displayPhone(me?.phone ?? "")}</dd>
          </div>
        </dl>
      </Card>

      <ChangeMyPassword />
    </div>
  );
}
