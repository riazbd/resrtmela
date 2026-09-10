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
