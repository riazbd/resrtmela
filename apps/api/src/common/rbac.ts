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

export function forbid(detail: string): Error {
  return Object.assign(new Error(detail), { status: 403 });
}

export function badRequest(detail: string): Error {
  return Object.assign(new Error(detail), { status: 400 });
}
