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
  looksRight: (v: unknown) => v is T,
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
    return looksRight(body) ? body : empty;
  } catch {
    return empty;
  }
}

const isPlanList = (v: unknown): v is PublicPlan[] => Array.isArray(v);
const isSettings = (v: unknown): v is Record<string, string> =>
  !!v && typeof v === "object" && !Array.isArray(v);

export async function fetchHomeData(
  apiUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<HomeData> {
  const [cms, resortPlans, agencyPlans] = await Promise.all([
    safely<Record<string, string>>(`${apiUrl}/cms`, fetchImpl, isSettings, {}),
    safely<PublicPlan[]>(`${apiUrl}/cms/plans?audience=RESORT`, fetchImpl, isPlanList, []),
    safely<PublicPlan[]>(`${apiUrl}/cms/plans?audience=AGENCY`, fetchImpl, isPlanList, []),
  ]);
  return { cms, resortPlans, agencyPlans };
}
