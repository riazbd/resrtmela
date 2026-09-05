import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Inject,
} from "@nestjs/common";
import { Request } from "express";
import * as jwt from "jsonwebtoken";
import { JwtClaims } from "@rh/shared";

export const JWT_SECRET =
  process.env.JWT_SECRET && process.env.JWT_SECRET !== ""
    ? process.env.JWT_SECRET
    : "dev-secret-change-me";

export interface AuthedRequest extends Request {
  user: JwtClaims;
}

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException("Missing bearer token");
    try {
      const claims = jwt.verify(token, JWT_SECRET) as unknown as JwtClaims & {
        sub: number;
      };
      req.user = { userId: claims.sub, role: claims.role, resortIds: claims.resortIds ?? [] };
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
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
