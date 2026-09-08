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

export function canAccessResort(claims: JwtClaims, resortId: number): boolean {
  if (claims.role === ROLE.SUPER_ADMIN) return true;
  return claims.resortIds.includes(resortId);
}

export function requireResortAccess(claims: JwtClaims, resortId: number): void {
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
