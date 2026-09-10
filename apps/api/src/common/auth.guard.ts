import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Inject,
} from "@nestjs/common";
import { Request } from "express";
import * as jwt from "jsonwebtoken";
import { JwtClaims, ROLE } from "@rh/shared";

export const JWT_SECRET =
  process.env.JWT_SECRET && process.env.JWT_SECRET !== ""
    ? process.env.JWT_SECRET
    : "dev-secret-change-me";

export interface AuthedRequest extends Request {
  user: JwtClaims;
}

const ROLES: ReadonlySet<string> = new Set(Object.values(ROLE));

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException("Missing bearer token");
    let claims: JwtClaims & { sub: number };
    try {
      claims = jwt.verify(token, JWT_SECRET) as unknown as JwtClaims & { sub: number };
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
    /**
     * The token is trusted on its own — no lookup, seven days to run — so a
     * role the platform has since removed would outlive its accounts by up to
     * a week. GUEST is the one that did: every guest account was deleted on
     * 2026-09-11, and a session signed the day before still verifies. The
     * signature being good is not the problem, so this does not say it is.
     */
    if (!ROLES.has(claims.role)) {
      throw new UnauthorizedException(
        "This sign-in is for a kind of account the platform no longer has. Sign in again with a resort or agency account.",
      );
    }
    req.user = { userId: claims.sub, role: claims.role, resortIds: claims.resortIds ?? [] };
    return true;
  }
}

export function signToken(claims: Omit<JwtClaims, "userId"> & { userId: number }): string {
  return jwt.sign(
    { sub: claims.userId, role: claims.role, resortIds: claims.resortIds },
    JWT_SECRET,
    {
      expiresIn: (process.env.JWT_EXPIRES_IN || "7d") as jwt.SignOptions["expiresIn"],
    },
  );
}
