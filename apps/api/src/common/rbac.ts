import { ROLE, type Role, JwtClaims } from "@rh/shared";

export const STAFF_ROLES: Role[] = [
  ROLE.SUPER_ADMIN,
  ROLE.RESORT_ADMIN,
  ROLE.MANAGER,
  ROLE.FRONT_DESK,
];

export const MANAGEMENT_ROLES: Role[] = [
  ROLE.SUPER_ADMIN,
  ROLE.RESORT_ADMIN,
  ROLE.MANAGER,
];

export function isStaff(role: Role): boolean {
  return STAFF_ROLES.includes(role);
}

export function isManagement(role: Role): boolean {
  return MANAGEMENT_ROLES.includes(role);
}

/**
 * Is this resort on the caller's list at all?
 *
 * For staff that is the whole question. For an agent it is only the first
 * half — see `requireResortAccess` below.
 */
export function canAccessResort(claims: JwtClaims, resortId: number): boolean {
  if (claims.role === ROLE.SUPER_ADMIN) return true;
  return claims.resortIds.includes(resortId);
}

/**
 * The caller may read this resort's records.
 *
 * An approved agency gets a `user_resorts` row, and login turns those rows into
 * the token's `resortIds` — the same list a manager's own resorts arrive in.
 * So for a long time this function could not tell the two apart, and every
 * caller that asked it alone was answering a different question than it thought:
 * twenty-seven of them, including the calendar with every guest's name on it,
 * the guest directory with phone and NID numbers, the day sheet with
 * outstanding balances, the revenue reports, and the API-key list. An agency is
 * an outside business and often a competitor of the next agency along; handing
 * it the resort's customer list is the one thing a resort would never agree to.
 *
 * So the default is closed. A link means an agent may **sell** the resort, and
 * the paths where selling is genuinely enough call `requireSellingAccess` by
 * name — which makes each of them a decision somebody made, rather than the
 * silent consequence of two different ideas sharing a list.
 */
export function requireResortAccess(claims: JwtClaims, resortId: number): void {
  if (!canAccessResort(claims, resortId)) {
    throw Object.assign(new Error("No access to this resort"), {
      status: 403,
    });
  }
  if (claims.role === ROLE.AGENT) {
    throw Object.assign(new Error("Agents cannot read this resort's records"), {
      status: 403,
    });
  }
}

/**
 * The caller may sell this resort: an approved agent, or the resort's own staff.
 *
 * Use this only where an agency genuinely needs the data to do its job —
 * searching for a free room, making a booking, reading back a booking it made.
 * Anything that returns another party's bookings, money or guests belongs to
 * `requireResortAccess` instead, and anything returning the agency's *own*
 * bookings must still narrow the query to the agency: this check answers "may
 * you be here", never "is this yours".
 */
export function requireSellingAccess(claims: JwtClaims, resortId: number): void {
  if (!canAccessResort(claims, resortId)) {
    throw Object.assign(new Error("No access to this resort"), {
      status: 403,
    });
  }
}

export function requireRoles(claims: JwtClaims, roles: Role[]): void {
  if (!roles.includes(claims.role)) {
    throw Object.assign(new Error("Insufficient role"), { status: 403 });
  }
}

/**
 * Sentinel actor for requests with no human behind them (public API key,
 * payment-gateway webhooks). It is deliberately not a real user id: anything
 * writing an actor to the database must store NULL instead, or the foreign key
 * to `users` fails. Use `actorIdOrNull()` at those write sites.
 */
export const SYSTEM_ACTOR_ID = 0;

export function actorIdOrNull(userId: number | null | undefined): number | null {
  return userId != null && userId > 0 ? userId : null;
}

/**
 * Claims for a request authenticated by a resort's API key. Scoped to that one
 * resort — never SUPER_ADMIN, which would bypass `canAccessResort` entirely and
 * let any future path reach across tenants.
 */
export function apiKeyClaims(resortId: number): JwtClaims {
  return { userId: SYSTEM_ACTOR_ID, role: ROLE.RESORT_ADMIN, resortIds: [resortId] };
}

export function forbid(detail: string): Error {
  return Object.assign(new Error(detail), { status: 403 });
}

export function badRequest(detail: string): Error {
  return Object.assign(new Error(detail), { status: 400 });
}

export function notFound(detail: string): Error {
  return Object.assign(new Error(detail), { status: 404 });
}
