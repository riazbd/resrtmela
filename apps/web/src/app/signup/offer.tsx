"use client";

import { useEffect, useState } from "react";
import { API_URL } from "@/lib/api";

/** What `GET /cms/offers/:code` says — the terms, never the invited address. */
export interface PublicOffer {
  code: string;
  audience: "RESORT" | "AGENCY";
  plan: { name: string; label: string; monthlyFee: number; trialDays: number } | null;
  trialDays: number;
  discountPct: number | null;
  expiresAt: string | null;
  invitation: boolean;
  usable: boolean;
}

export interface OfferState {
  code: string | null;
  offer: PublicOffer | null;
  /** why a code in the link cannot be used here, in a sentence */
  problem: string | null;
}

/**
 * The offer a signup link carries (`?offer=CODE`), read once on arrival.
 *
 * Read from `window.location` rather than `useSearchParams`, which would make
 * the whole page wait on a Suspense boundary for one optional parameter.
 */
export function useOffer(audience: "RESORT" | "AGENCY"): OfferState {
  const [state, setState] = useState<OfferState>({ code: null, offer: null, problem: null });
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("offer")?.trim();
    if (!code) return;
    fetch(`${API_URL}/cms/offers/${encodeURIComponent(code)}`)
      .then(async (r) => {
        if (!r.ok) return setState({ code, offer: null, problem: "This offer link is not valid." });
        const o = (await r.json()) as PublicOffer;
        const problem =
          o.audience !== audience
            ? audience === "AGENCY" ? "This offer is for resorts — sign up a resort instead." : "This offer is for travel agencies — sign up as an agency."
            : !o.usable ? "This offer has expired or been used up." : null;
        setState({ code, offer: o, problem });
      })
      .catch(() => setState({ code, offer: null, problem: "This offer could not be checked." }));
  }, [audience]);
  return state;
}

export function offerLine(o: PublicOffer): string {
  const parts = [o.plan?.label ?? o.plan?.name ?? ""];
  if (o.trialDays) parts.push(`${o.trialDays} days free`);
  if (o.discountPct) parts.push(`${o.discountPct}% off`);
  return parts.filter(Boolean).join(" · ");
}

export function OfferBanner({ state }: { state: OfferState }) {
  if (!state.code) return null;
  if (state.problem || !state.offer) {
    return <p className="mb-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">{state.problem ?? "Checking your offer…"}</p>;
  }
  return (
    <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800 ring-1 ring-emerald-200">
      <b>{state.offer.invitation ? "You were invited" : "Offer applied"}:</b> {offerLine(state.offer)}
      {state.offer.invitation ? " — use the email address the invitation was sent to." : ""}
    </p>
  );
}
