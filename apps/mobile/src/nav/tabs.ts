/**
 * Which of the console's thirty destinations fit on a phone's tab bar.
 *
 * A sidebar can list everything; five tabs cannot. So the app chooses four
 * per audience — the screens that audience opens all day — and More holds
 * the rest.
 *
 *   resort staff   Home · Calendar · Bookings · Rooms · More
 *   agent          Discover · Find a room · Calendar · Sales · More
 *
 * Nothing here decides *whether* somebody may see a screen. That is
 * `navVisible` over `CONSOLE_NAV`, both in `@rh/shared`, so a tab the phone
 * offers is a screen the server will serve.
 */
import { CONSOLE_NAV, navVisible, type NavDestination } from "@rh/shared";

/** What the session knows about the person looking. */
export interface Who {
  role: string;
  can: (perm: string) => boolean;
  /** Keys from PLAN_FEATURES: the active resort's plan, or the agency's own. */
  features: string[];
}

/**
 * The four, by audience, in the order they appear on the bar.
 *
 * The platform owner is absent on purpose: native platform administration
 * is out of scope by the owner's own choice — it is their tool, and it stays
 * on the desk. They get no tab bar rather than an empty one.
 */
const PREFERRED: Record<string, string[]> = {
  AGENT: ["/agent/discover", "/agent/search", "/agent/calendar", "/agent/sales"],
  RESORT: ["/dashboard", "/calendar", "/bookings", "/rooms"],
};

const entry = (href: string): NavDestination | undefined =>
  CONSOLE_NAV.find((e) => e.href === href);

const audienceOf = (who: Who): keyof typeof PREFERRED | null =>
  who.role === "SUPER_ADMIN" ? null : who.role === "AGENT" ? "AGENT" : "RESORT";

/**
 * The tabs this person gets, in order.
 *
 * Filtered, never disabled and never backfilled. Somebody who may see
 * bookings but not rooms gets a three-tab bar: a disabled tab is a promise
 * the product does not keep, and quietly substituting a fifth screen they
 * did not ask for makes the bar mean something different for each person.
 */
export function tabsFor(who: Who): NavDestination[] {
  const audience = audienceOf(who);
  if (!audience) return [];
  return PREFERRED[audience]!
    .map(entry)
    .filter((e): e is NavDestination => !!e && navVisible(e, who));
}

/**
 * Everything else this person may reach, in the console's own order.
 *
 * The order matters more than it looks: somebody who learned the sidebar on
 * the desk should find the same things in the same sequence on the phone.
 *
 * `/account` is not here, because it is not in `CONSOLE_NAV` — changing your
 * own password is nobody's to grant. The More screen adds it itself, beside
 * Sign out, which is where the console's sidebar keeps it too.
 */
export function moreFor(who: Who): NavDestination[] {
  const onTheBar = new Set(tabsFor(who).map((t) => t.href));
  return CONSOLE_NAV.filter((e) => !onTheBar.has(e.href) && navVisible(e, who));
}
