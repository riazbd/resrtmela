import { isPeriodUnit } from "@rh/shared";
import type { PublicPlan } from "./plan";

/**
 * Everything the front page needs, fetched before it is rendered.
 *
 * The page used to fetch these in the browser, which meant the prices — and
 * the trial length, and every CMS-written word — were absent from the HTML.
 * A visitor on a slow phone read a page with no prices on it for a moment, and
 * anything reading the page without running JavaScript never saw them at all.
 *
 * Moving the fetch to the server puts the API in the critical path of the one
 * page that has to be up even when the console is not. So nothing here throws:
 * a failure costs the prices, which is exactly what it used to cost, and the
 * marketing page still renders.
 *
 * Both price lists are fetched because the page shows both — the switch above
 * the cards is a choice between two lists already in hand, not a round trip.
 */
export interface HomeData {
  cms: Record<string, string>;
  resortPlans: PublicPlan[];
  agencyPlans: PublicPlan[];
}

/** Fetch one thing, and treat every kind of failure as "nothing to show". */
async function safely<T>(
  url: string,
  fetchImpl: typeof fetch,
  /** Turns whatever came back into something safe to render — never throws. */
  clean: (v: unknown) => T,
  empty: T,
): Promise<T> {
  try {
    const r = await fetchImpl(url, {
      // the price list is edited in Platform → Plans and the site has to follow;
      // half a minute is close enough to "immediately" for a marketing page and
      // stops every visit waiting on the API
      next: { revalidate: 30 },
    } as RequestInit);
    if (!r.ok) return empty;
    const body: unknown = await r.json();
    return clean(body);
  } catch {
    return empty;
  }
}

/**
 * A plan the page can actually draw.
 *
 * This was `Array.isArray(v)`, which asserted `PublicPlan[]` while checking
 * nothing about the rows. That was survivable while a price was two number
 * fields — a missing number renders blank — but a price is a list of rungs
 * now, and the card iterates it. The first row without one threw during the
 * static render and took the whole front page down, on a deploy, because the
 * page is prerendered against whatever API is running at build time and that
 * one was still the old build.
 *
 * So the shape is checked rather than asserted, and a card with no price is
 * dropped rather than drawn: a plan nobody can be put on has no business on
 * the pricing page, and the rest of the list is still a page.
 */
function isDrawablePlan(v: unknown): v is PublicPlan {
  if (!v || typeof v !== "object") return false;
  const p = v as Partial<PublicPlan>;
  if (typeof p.name !== "string") return false;
  if (!Array.isArray(p.schedules) || p.schedules.length === 0) return false;
  return p.schedules.every(
    (s) =>
      s &&
      typeof s.label === "string" &&
      Array.isArray(s.phases) &&
      s.phases.length > 0 &&
      s.phases.every((ph) => isPeriodUnit(ph?.unit) && typeof ph?.price === "number"),
  );
}

/** Whatever came back, minus the rows that would throw. */
const planList = (v: unknown): PublicPlan[] => (Array.isArray(v) ? v.filter(isDrawablePlan) : []);
const settings = (v: unknown): Record<string, string> =>
  !!v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : {};

export async function fetchHomeData(
  apiUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<HomeData> {
  const [cms, resortPlans, agencyPlans] = await Promise.all([
    safely<Record<string, string>>(`${apiUrl}/cms`, fetchImpl, settings, {}),
    safely<PublicPlan[]>(`${apiUrl}/cms/plans?audience=RESORT`, fetchImpl, planList, []),
    safely<PublicPlan[]>(`${apiUrl}/cms/plans?audience=AGENCY`, fetchImpl, planList, []),
  ]);
  return { cms, resortPlans, agencyPlans };
}
