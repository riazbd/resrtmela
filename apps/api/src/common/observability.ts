/**
 * What the platform can see about itself.
 *
 * Before this: PM2 restarted a crash and nobody was told, a 500 handed the
 * caller whatever an internal Error happened to say — Prisma puts the failing
 * query in there — and a support call ("it broke at about four") could not be
 * connected to anything in a log.
 *
 * Three small pieces, deliberately dependency-free. A hosted error tracker is
 * a good idea later; a platform that cannot answer "what happened at four"
 * without one is not.
 *
 * - Every request gets an id, echoed in `X-Request-Id` and printed in the
 *   line for that request.
 * - Every request logs one JSON line, so the log is queryable (`jq`, `grep
 *   '"level":"error"'`, or whatever ships it later) instead of readable-only.
 * - A failure returns that id to the caller, and — above 500 — stops
 *   returning the internal message.
 */
import { randomUUID } from "node:crypto";

/** Query parameters that must never reach a log file or a support screenshot. */
const SECRET_PARAMS = /^(token|password|pass|secret|key|apikey|api_key|code|otp|signature)$/i;

/**
 * Strips credentials out of a URL's query string, keeping everything else.
 * A log that hides too much stops being worth keeping, so only the parameters
 * that are actually secrets are replaced.
 */
export function scrubUrl(url: string): string {
  const q = url.indexOf("?");
  if (q === -1) return url;
  const path = url.slice(0, q);
  const params = url
    .slice(q + 1)
    .split("&")
    .map((pair) => {
      const eq = pair.indexOf("=");
      if (eq === -1) return pair;
      const name = pair.slice(0, eq);
      return SECRET_PARAMS.test(decodeURIComponent(name)) ? `${name}=REDACTED` : pair;
    });
  return `${path}?${params.join("&")}`;
}

export interface HttpLogFields {
  id: string;
  method: string;
  url: string;
  status: number;
  ms: number;
  userId?: number | null;
  resortId?: number | null;
  ip?: string | null;
}

/** info below 400, warn for the caller's fault, error for ours. */
function levelFor(status: number): "info" | "warn" | "error" {
  if (status >= 500) return "error";
  if (status >= 400) return "warn";
  return "info";
}

export function httpLogLine(f: HttpLogFields): string {
  return JSON.stringify({
    t: new Date().toISOString(),
    level: levelFor(f.status),
    msg: "http",
    id: f.id,
    method: f.method,
    url: scrubUrl(f.url),
    status: f.status,
    ms: Math.round(f.ms * 10) / 10,
    ...(f.userId != null ? { userId: f.userId } : {}),
    ...(f.resortId != null ? { resortId: f.resortId } : {}),
    ...(f.ip ? { ip: f.ip } : {}),
  });
}

/** One line for anything that is not a request: a sweep, a boot, a crash. */
export function eventLogLine(
  level: "info" | "warn" | "error",
  msg: string,
  fields: Record<string, unknown> = {},
): string {
  return JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields });
}

export interface ErrorBody {
  statusCode: number;
  message: string;
  requestId: string;
}

/**
 * A 4xx message was written for the person reading it, so it is kept. A 5xx
 * message was written by a library for a developer — it leaks table names,
 * queries and file paths — so the caller gets the request id instead and the
 * detail stays in the log where it belongs.
 */
export function errorBody(status: number, message: string, requestId: string): ErrorBody {
  if (status >= 500) {
    return {
      statusCode: status,
      message: `Something went wrong at our end. Quote ${requestId} if you contact support.`,
      requestId,
    };
  }
  return { statusCode: status, message, requestId };
}

/** Short enough to read down a phone line, random enough not to collide. */
export function newRequestId(): string {
  return randomUUID().slice(0, 8);
}
