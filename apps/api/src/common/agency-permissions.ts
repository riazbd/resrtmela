/**
 * What an agent may do, decided once.
 *
 * Two places need this answer — the permission service that the console's
 * navigation reads, and the agency context every agency-side service runs
 * through — and they each had their own copy of the rule. Two copies of "what
 * may this person do" is the kind of drift that ends with a screen offering a
 * button the server refuses, or worse, the other way round.
 *
 * The database read stays with the caller, because each already has the row in
 * hand; only the rule lives here.
 */
import { AGENT_PERMISSIONS } from "@rh/shared";

/**
 * What an agency staff member without a role may do.
 *
 * Every staff member who existed before roles arrived has no role, and taking
 * their access away on the day of an upgrade would be a support call from
 * every agency at once.
 */
export const DEFAULT_STAFF_PERMISSIONS = ["agent.book", "agent.wallet.view"];

export interface AgentPermissionRow {
  /** null means this user is an agency in their own right */
  parentAgentId: number | null;
  agentRole?: { permissions: unknown } | null;
}

/**
 * An agency owner holds everything by being the owner — including any
 * permission added later, which is why this reads the list rather than a
 * stored copy. Only staff carry a role, because only staff can be given less.
 */
export function agentPermissionsFor(me: AgentPermissionRow): string[] {
  if (me.parentAgentId == null) return [...AGENT_PERMISSIONS];
  const stored = me.agentRole?.permissions;
  return Array.isArray(stored) ? (stored as string[]) : [...DEFAULT_STAFF_PERMISSIONS];
}
