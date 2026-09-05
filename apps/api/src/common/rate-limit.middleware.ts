import { Injectable, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";

/**
 * Minimal in-memory fixed-window rate limiter for auth endpoints.
 * Per-IP: max `limit` requests per `windowMs`. Swap for Redis in production.
 */
@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private hits = new Map<string, { count: number; resetAt: number }>();

  private readonly limit = Number(process.env.AUTH_RATE_LIMIT ?? 30);
  private readonly windowMs = Number(process.env.AUTH_RATE_WINDOW_MS ?? 60_000);

  use(req: Request, res: Response, next: NextFunction) {
    const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const now = Date.now();
    const entry = this.hits.get(ip);
    if (!entry || now > entry.resetAt) {
      this.hits.set(ip, { count: 1, resetAt: now + this.windowMs });
      return next();
    }
    entry.count++;
    if (entry.count > this.limit) {
      const retry = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retry));
      return res.status(429).json({
        statusCode: 429,
        message: `Too many attempts — retry in ${retry}s`,
      });
    }
    // opportunistic cleanup
    if (this.hits.size > 5000) {
      for (const [k, v] of this.hits) if (now > v.resetAt) this.hits.delete(k);
    }
    return next();
  }
}
