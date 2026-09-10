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
  // guests use the app; the console would be a wall of things they cannot do
  if (state.me.role === "GUEST") return "login";
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
  // agent-only links are gated by the agency's own permission set, so a junior
  // who may only book does not see the wallet or the team screen
  if (entry.roles.length === 1 && entry.roles[0] === "AGENT") {
    return who.role === "AGENT" && (entry.perm ? who.can(entry.perm) : true);
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
