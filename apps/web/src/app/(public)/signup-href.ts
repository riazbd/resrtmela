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
  scheduleId,
}: {
  audience: "RESORT" | "AGENCY";
  /** The plan's `name`, as the platform stores it. */
  plan: string;
  /**
   * Which way they were being shown it — the `PlanSchedule` behind the card
   * they pressed.
   *
   * This was `yearly: boolean`, which carried exactly one bit because there
   * were exactly two shelves. An id carries whichever one the owner wrote, so
   * a visitor who pressed a card reading "Free for a week, then ৳500" arrives
   * at a signup that charges that and not something else.
   */
  scheduleId: number | null;
}): string {
  const path = audience === "AGENCY" ? "/signup/agency" : "/signup";
  const params = new URLSearchParams();
  // encoded, not interpolated: the name is typed by a super admin, and an `&`
  // pasted straight into the URL would silently split it into two parameters
  if (plan) params.set("plan", plan);
  if (scheduleId != null) params.set("schedule", String(scheduleId));
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/**
 * `plannedPlan` and `plannedShelf` used to live here.
 *
 * They moved to `@rh/shared` on 2026-09-21, when the phone grew a price
 * list and a signup that carries a plan. They are decisions about what a
 * person is buying rather than arithmetic, and two clients answering them
 * differently is the most expensive kind of drift — the kind a customer
 * finds, on a bill.
 *
 * `signupHref` stays: building a URL is this client's own business, and
 * the phone pushes a route instead.
 */
export { plannedPlan, plannedShelf } from "@rh/shared";
