/**
 * Where a plan card's "Start free trial" goes.
 *
 * Extracted from the pricing section because it was a three-way conditional
 * inside a `<Link>` in a 700-line page, and it was wrong: the resort branch
 * dropped the plan. A workspace that clicked Chain opened on Starter, and
 * nothing in the repository could have told anyone so.
 *
 * Both audiences now carry the plan. That was already true of agencies; for
 * resorts it became true the day signup started opening a subscription from
 * the first hour (`a-plan-from-the-first-day`), and this is the link catching
 * up with it.
 */
export function signupHref({
  audience,
  plan,
  yearly,
}: {
  audience: "RESORT" | "AGENCY";
  /** The plan's `name`, as the platform stores it. */
  plan: string;
  yearly: boolean;
}): string {
  const path = audience === "AGENCY" ? "/signup/agency" : "/signup";
  const params = new URLSearchParams();
  // encoded, not interpolated: the name is typed by a super admin, and an `&`
  // pasted straight into the URL would silently split it into two parameters
  if (plan) params.set("plan", plan);
  if (yearly) params.set("billing", "YEARLY");
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/**
 * The other half of the same contract: which plan the signup form describes
 * and submits, given what the link said.
 *
 * The form used to take `plans[0]` unconditionally, so it told a visitor who
 * had clicked Chain that they were getting "Starter · 15 rooms" while they
 * typed — which is why nobody reported this as a bug until a workspace was
 * already open on the wrong plan.
 *
 * An unrecognised name falls back rather than showing nothing. A plan can be
 * retired between somebody bookmarking a link and opening it, and a form that
 * describes no plan at all is the state this copy exists to prevent; the API
 * refuses the name on submit, and its refusal names the shelf.
 */
export function plannedPlan<T extends { name: string }>(shelf: readonly T[] | null, wanted: string | null): T | null {
  if (!shelf?.length) return null;
  const asked = wanted?.trim().toUpperCase();
  return (asked ? shelf.find((p) => p.name.toUpperCase() === asked) : null) ?? shelf[0];
}
