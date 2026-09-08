/**
 * One JSON line per request, and an id the caller can quote.
 *
 * Runs on every route. It logs on `finish`, so the line carries the status and
 * the real duration rather than a guess made on the way in. The id is attached
 * to the request before anything else touches it, so the exception filter can
 * put the same id in the error body: a support call now starts with a string
 * that finds the exact line.
 *
 * /health is logged only when it fails — an uptime check every thirty seconds
 * would otherwise be the entire log.
 */
import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { httpLogLine, newRequestId } from "./observability";

export interface TracedRequest extends Request {
  id?: string;
  user?: { userId?: number; resortIds?: number[] };
}

@Injectable()
export class RequestLogMiddleware implements NestMiddleware {
  use(req: TracedRequest, res: Response, next: NextFunction) {
    const id = newRequestId();
    req.id = id;
    res.setHeader("X-Request-Id", id);
    const started = process.hrtime.bigint();

    res.on("finish", () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      const quiet = req.originalUrl.startsWith("/health") && res.statusCode < 400;
      if (quiet) return;
      // req.user is set by AuthGuard, which runs after this middleware but
      // before the response finishes — so by now it is there when there is one.
      console.log(
        httpLogLine({
          id,
          method: req.method,
          url: req.originalUrl,
          status: res.statusCode,
          ms,
          userId: req.user?.userId ?? null,
          resortId: req.user?.resortIds?.[0] ?? null,
          ip: req.ip ?? null,
        }),
      );
    });

    next();
  }
}
