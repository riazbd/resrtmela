/**
 * Who gets past the console's front door.
 *
 * This used to be one line inside the layout — `loading || !me ||
 * !activeResort` — and everything that failed it saw "Loading…". Two of the
 * people it caught were not loading, and the more embarrassing one was the
 * platform's own owner: a SUPER_ADMIN has no resort, because they sell to
 * resorts rather than run one, so unless their account happened to be linked to
 * somebody's resort they sat on a spinner and could never reach Platform →
 * Plans — the one screen nobody else can open.
 *
 * A rule with four answers is not a boolean, so it is not written as one.
 */
export type ConsoleGate = "loading" | "login" | "no-resort" | "ready";

/** Roles whose work is not inside a single resort. */
const RESORTLESS = new Set(["SUPER_ADMIN", "AGENT"]);

export function consoleGate(state: {
  loading: boolean;
  me: { role: string } | null;
  activeResort: { id: number } | null;
}): ConsoleGate {
  if (state.loading) return "loading";
  if (!state.me) return "login";
  if (state.activeResort) return "ready";
  /**
   * The platform owner sells to resorts; an agent sells across them, and needs
   * the console before they have been let into any — the screen where they ask
   * for access is in it.
   */
  if (RESORTLESS.has(state.me.role)) return "ready";
  // staff whose link was removed: locked out, not loading, and told so
  return "no-resort";
}

/** One entry in the sidebar, as far as visibility is concerned. */
export interface NavEntry {
  roles: string[];
  perm?: string;
  /** A key from PLAN_FEATURES: the link is for a screen the plan may not include. */
  feature?: string;
}

/**
 * One destination, as both clients know it.
 *
 * Everything here is data. What is deliberately absent is the icon and the
 * way of drawing it: lucide on the desk, a vector set on the phone, and a
 * shared package that imported either would stop being shareable.
 */
export interface NavDestination extends NavEntry {
  /** The console's path. The app's routes are the same paths, by design. */
  href: string;
  /** A key into the dictionaries, for the strings that are translated. */
  labelKey?: string;
  /** Plain text, for the ones that are not — mostly the newer screens. */
  label?: string;
}

/**
 * Every destination the console offers, in the order it offers them.
 *
 * It lived in `apps/web/src/app/(app)/layout.tsx` until 2026-09-20. The rule
 * that decides visibility moved here first, which left the rule shared and
 * the rows it runs over private — so the app would have kept a second copy
 * of thirty entries with their permissions and plan features written out
 * again. That copy would have been wrong within a month, and wrong in the
 * worst direction: a link the phone shows and the server refuses, or a
 * screen the resort is paying for that the phone never offers.
 *
 * `perm` is what actually decides visibility now that the API checks the
 * permission matrix rather than the fixed role. `roles` remains only for the
 * two audiences a permission cannot describe: the platform team and agents.
 */
export const CONSOLE_NAV: readonly NavDestination[] = [
  { href: "/platform", label: "Platform", roles: ["SUPER"] },
  { href: "/agent/discover", label: "Discover resorts", roles: ["AGENT"] },
  { href: "/agent/search", label: "Find a room", roles: ["AGENT"], perm: "agent.book" },
  { href: "/agent/calendar", label: "Calendar", roles: ["AGENT"], perm: "agent.book" },
  { href: "/agent/tours", label: "Tours", roles: ["AGENT"], perm: "agent.tours.manage" },
  { href: "/agent/sales", label: "Quotes & invoices", roles: ["AGENT"], perm: "agent.sales.manage" },
  { href: "/agent/guests", label: "Guests", roles: ["AGENT"], perm: "agent.guests.view" },
  { href: "/agent/expenses", label: "Expenses", roles: ["AGENT"], perm: "agent.expenses.manage" },
  { href: "/agent/payroll", label: "Payroll", roles: ["AGENT"], perm: "agent.payroll.manage" },
  { href: "/agent/wallet", label: "Wallet", roles: ["AGENT"], perm: "agent.wallet.view" },
  { href: "/agent/team", label: "My team", roles: ["AGENT"], perm: "agent.staff.manage" },
  // sold on the agency's own plan (2026-09-17): hidden when the plan leaves them out
  { href: "/agent/website", label: "Website", roles: ["AGENT"], perm: "agent.website.manage", feature: "agency_website" },
  { href: "/agent/api", label: "API", roles: ["AGENT"], perm: "agent.apikeys.manage", feature: "agency_api" },
  { href: "/mailbox", label: "Bulk Email", roles: ["MGMT", "AGENT"], perm: "marketing.send", feature: "bulk_email" },
  { href: "/daysheet", labelKey: "nav.daySheet", roles: ["STAFF"], perm: "bookings.view" },
  { href: "/dashboard", labelKey: "nav.dashboard", roles: ["STAFF"], perm: "bookings.view" },
  { href: "/calendar", labelKey: "nav.calendar", roles: ["*"], perm: "bookings.view" },
  { href: "/bookings", labelKey: "nav.bookings", roles: ["*"], perm: "bookings.view" },
  { href: "/payments", labelKey: "nav.dues", roles: ["STAFF"], perm: "payments.view" },
  { href: "/guests", labelKey: "nav.guests", roles: ["STAFF"], perm: "guests.view" },
  { href: "/expenses", labelKey: "nav.expenses", roles: ["STAFF"], perm: "expenses.view" },
  { href: "/fb", labelKey: "nav.fb", roles: ["STAFF"], perm: "restaurant.view", feature: "restaurant" },
  { href: "/payroll", label: "Payroll", roles: ["PAYROLL"], perm: "payroll.view", feature: "payroll" },
  { href: "/reports", labelKey: "nav.reports", roles: ["STAFF"], perm: "reports.view" },
  { href: "/rooms", labelKey: "nav.rooms", roles: ["MGMT"], perm: "rooms.view" },
  /**
   * The one destination a `HOUSEKEEPING` account can reach.
   *
   * `MGMT` here means what it means on every row below — resort side,
   * as against the platform's and the agency's. `navVisible` reads
   * `roles` only for SUPER and AGENT; everything else is decided by the
   * permission, and `housekeeping.view` is held by management, the
   * front desk (which sells the room) and the housekeeper.
   */
  { href: "/housekeeping", labelKey: "nav.housekeeping", roles: ["MGMT"], perm: "housekeeping.view" },
  { href: "/activities", labelKey: "nav.activities", roles: ["STAFF"], perm: "activities.view", feature: "activities" },
  { href: "/import", labelKey: "nav.import", roles: ["MGMT"], perm: "import.run", feature: "imports" },
  { href: "/profile", labelKey: "nav.profile", roles: ["AGENT"] },
  { href: "/settings", labelKey: "nav.settings", roles: ["MGMT"], perm: "settings.manage" },
];

/**
 * Deliberately not in the list above: `/account`.
 *
 * Every entry in `CONSOLE_NAV` is filtered by role, permission and plan, and
 * changing your own password belongs to whoever is signed in — resort staff,
 * an agency, the platform's own owner, whatever they are. The console puts it
 * in the sidebar's footer beside Sign out for that reason, and the app puts
 * it in the same place at the bottom of More. Named here so the next person
 * to notice it missing finds the answer rather than adding it.
 */
export const ACCOUNT_HREF = "/account";

/**
 * Whether a link belongs on this person's sidebar.
 *
 * Two questions, not one. `perm` is what the owner gave this person; `feature`
 * is what the resort's plan includes. Only the first was ever asked, so a
 * resort on a plan without the restaurant kept "Restaurant" in its sidebar and
 * met a 403 on arriving — a menu leading to a wall, which is the same fault the
 * permission matrix had in the other direction.
 *
 * `features` is the *active resort's* plan, so it is deliberately not consulted
 * for an agent's own screens: an agency has no resort plan, and asking a
 * resort's plan whether an agency may see its own wallet is the wrong question.
 */
export function navVisible(
  entry: NavEntry,
  who: { role: string; can: (perm: string) => boolean; features: string[] },
): boolean {
  if (entry.roles.includes("SUPER")) return who.role === "SUPER_ADMIN";
  /**
   * The platform owner's sidebar is the platform's, and only the platform's.
   *
   * SUPER_ADMIN resolves to `["*"]`, so every permission check below says yes
   * and the whole resort console appeared in their sidebar — with "Platform" as
   * one item among fifteen. Worse, it was a *particular* resort's console,
   * whichever one their account happened to be linked to, which made a resort
   * they do not run look like theirs.
   *
   * A resort's screens are reached by "Login as" from the Resorts tab. That
   * swaps the role on the token, so the sidebar below follows the tenant — and
   * it is audited and banner-marked, which is how the platform ought to be
   * acting inside someone else's business anyway.
   */
  if (who.role === "SUPER_ADMIN") return false;
  // agent-only links are gated by the agency's own permission set, so a junior
  // who may only book does not see the wallet or the team screen
  if (entry.roles.length === 1 && entry.roles[0] === "AGENT") {
    // and by the agency's own plan, for the screens a plan sells (2026-09-17);
    // `features` is the agency's here, never a resort's
    return (
      who.role === "AGENT" &&
      (entry.perm ? who.can(entry.perm) : true) &&
      (entry.feature ? who.features.includes(entry.feature) : true)
    );
  }
  if (entry.roles.includes("AGENT") && !entry.perm) return who.role === "AGENT";
  if (entry.perm && !who.can(entry.perm)) return false;
  /**
   * Features belong to the active resort's plan, and an agency has no resort
   * plan. Bulk Email is the link that exposes this: it is shared between a
   * resort's management and agents, and an agent's copy writes to the agency's
   * own guest list — which the resort's plan has no say over. The API draws the
   * same line.
   */
  if (who.role === "AGENT") return true;
  if (entry.feature && !who.features.includes(entry.feature)) return false;
  return true;
}

/**
 * The feature this screen needs and the plan does not have, if any.
 *
 * Hiding the link is not the whole job: a typed URL, or a bookmark from before
 * the plan changed, still opens the screen. Nothing breaks — the API refuses
 * the writes — but the page offers a button that answers 403 and says nothing
 * about why. The layout already knows which screen it is showing and what the
 * plan includes, so it says so once rather than five pages each saying it.
 *
 * Reads are deliberately left open. A resort whose plan no longer includes the
 * restaurant can still read the bills it took while it did; locking creation is
 * the sale, locking history would be keeping their own books from them.
 */
export function missingFeature(
  pathname: string,
  entries: (NavEntry & { href: string })[],
  features: string[],
): string | null {
  const screen = entries.find(
    (e) => e.feature && (pathname === e.href || pathname.startsWith(`${e.href}/`)),
  );
  if (!screen?.feature) return null;
  return features.includes(screen.feature) ? null : screen.feature;
}

/**
 * The screen someone should land on after signing in.
 *
 * Everybody used to be sent to `/dashboard`, which is a resort's front desk.
 * For the platform owner that meant logging in to somebody else's resort; for
 * an agent it meant a page their permissions refuse, since `bookings.view` is
 * not an agency permission.
 *
 * A table rather than "the first link they can see": permissions have not been
 * fetched yet at the moment of the redirect — they arrive with the active
 * resort — and guessing from an empty set would send everyone to the same
 * wrong place for a different reason.
 */
export function landingFor(role: string): string {
  if (role === "SUPER_ADMIN") return "/platform";
  if (role === "AGENT") return "/agent/discover";
  return "/dashboard";
}
