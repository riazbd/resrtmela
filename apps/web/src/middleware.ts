import { NextResponse, type NextRequest } from "next/server";
import { isOwnHost, normaliseHost } from "@rh/shared";
import { API_URL } from "@/lib/api-url";

/**
 * The only routing decision this application makes before rendering
 * (2026-09-15 design, §4).
 *
 * Three audiences share one Next app: the platform's marketing pages, the
 * console, and every resort's published site. The first two are reached at
 * hostnames this deployment owns; the third at whatever domain the resort
 * brought. So an unfamiliar `Host` is a resort's front door, and is rewritten
 * to the page that draws one.
 *
 * A rewrite rather than a redirect: the address bar must keep saying the
 * resort's own domain, which is the entire point of them having one.
 *
 * The rules it stands on — what counts as a hostname, and which hosts are ours
 * — are pure functions in `@rh/shared` with their own tests. Read them wrong
 * and the console is served at a customer's domain, or a customer's site where
 * the console should be, and neither is a thing to find out about later.
 */
const OWN_HOSTS = (process.env.NEXT_PUBLIC_OWN_HOSTS ?? "")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

/**
 * Whose site answers at this host.
 *
 * Cached, because this runs on every request at a resort's domain and the
 * answer changes about once in a resort's lifetime. Five minutes is the floor;
 * the API pulls the tag when a domain is verified, removed, or its resort
 * renamed, so a real change is not waiting on a timer.
 */
async function siteAt(host: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/domains/lookup?host=${encodeURIComponent(host)}`, {
      next: { revalidate: 300, tags: [`domain:${host}`] },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { slug?: unknown };
    return typeof body.slug === "string" ? body.slug : null;
  } catch {
    // the API being briefly quiet must not take the marketing site down too
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const host = normaliseHost(req.headers.get("host"));
  // our own hostnames, and the one this deployment is actually reached at, are
  // never a customer's
  if (!host || isOwnHost(host, [...OWN_HOSTS, req.nextUrl.hostname])) return NextResponse.next();

  const slug = await siteAt(host);
  // a stray DNS record pointed at us is not an error: the marketing site
  // answers, which is what happens today
  if (!slug) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = req.nextUrl.pathname === "/" ? `/r/${slug}` : `/r/${slug}${req.nextUrl.pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  /**
   * Everything except what the framework and the file store own. Rewriting
   * those is the mistake that renders a page perfectly and then loads none of
   * its own JavaScript — which looks like a styling bug and is not one. The
   * matcher rather than a check inside: this runs on every request, and the
   * cheapest one is the one that does not run.
   */
  matcher: ["/((?!_next/|uploads/|api/|favicon.ico|robots.txt|icon.svg).*)"],
};
