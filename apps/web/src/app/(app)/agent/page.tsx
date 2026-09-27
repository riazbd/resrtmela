"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { landingFor } from "@/lib/console-access";
import { useAuth } from "@/lib/auth";
import { Spinner } from "@/components/ui";

/**
 * `/agent` is a section, not a screen — so it sends you into it.
 *
 * There was no page here until 2026-09-28, which made the address every
 * agency screen hangs off a 404. Twelve routes live under `/agent/`, so it is
 * a URL somebody arrives at by trimming one, by following a stale bookmark,
 * or by a link that dropped its last segment — and what they got was the
 * not-found page, whose only button used to send them to the resort day
 * sheet they are not allowed to open.
 *
 * `landingFor` rather than a hardcoded `/agent/discover`: it is the same rule
 * that decides where signing in lands, and a resort user who arrives here
 * belongs on their own dashboard rather than inside the agency section.
 */
export default function AgentIndex() {
  const { me, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(me ? landingFor(me.role) : "/login");
  }, [loading, me, router]);

  return <Spinner />;
}
