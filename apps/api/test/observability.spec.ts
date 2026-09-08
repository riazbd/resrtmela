/**
 * What the platform can see about itself.
 *
 * Until now: PM2 restarted a crash and nobody was told, a 500 handed the
 * caller whatever an internal Error happened to say (Prisma puts the failing
 * SQL in there), and there was no way to connect a support call — "it broke at
 * about four" — to a line in a log.
 *
 * These are the pure pieces: the log line, and the body a failure returns.
 */
import { describe, expect, it } from "vitest";
import { httpLogLine, errorBody, scrubUrl } from "../src/common/observability";

describe("access log", () => {
  it("is one JSON line, so a log file can be queried instead of read", () => {
    const line = httpLogLine({
      id: "abc123", method: "GET", url: "/bookings", status: 200, ms: 12.5, userId: 7, resortId: 3,
    });
    expect(line.includes("\n")).toBe(false);
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed).toMatchObject({ msg: "http", id: "abc123", method: "GET", status: 200, userId: 7 });
    expect(typeof parsed.t).toBe("string");
  });

  it("grades itself by status, so errors can be found without a regex", () => {
    expect(JSON.parse(httpLogLine({ id: "a", method: "GET", url: "/x", status: 200, ms: 1 })).level).toBe("info");
    expect(JSON.parse(httpLogLine({ id: "a", method: "GET", url: "/x", status: 403, ms: 1 })).level).toBe("warn");
    expect(JSON.parse(httpLogLine({ id: "a", method: "GET", url: "/x", status: 500, ms: 1 })).level).toBe("error");
  });

  it("never writes a credential into the log", () => {
    const line = httpLogLine({
      id: "a", method: "POST", url: "/auth/verify?token=eyJhbGciOi&phone=8801711111111&password=hunter2",
      status: 200, ms: 1,
    });
    expect(line).not.toContain("eyJhbGciOi");
    expect(line).not.toContain("hunter2");
    expect(line).toContain("token=REDACTED");
    // things that are not secrets survive, or the log stops being useful
    expect(line).toContain("8801711111111");
  });

  it("leaves a url with nothing sensitive in it alone", () => {
    expect(scrubUrl("/reports/daily?date=2026-09-09")).toBe("/reports/daily?date=2026-09-09");
  });
});

describe("error body", () => {
  it("keeps a 4xx message, because it was written for the person reading it", () => {
    const body = errorBody(402, "Sky Eco is suspended, so new entries cannot be saved.", "req-1");
    expect(body.message).toContain("suspended");
    expect(body.requestId).toBe("req-1");
  });

  it("replaces a 5xx message, because internals leak through it", () => {
    const body = errorBody(500, "Invalid `prisma.booking.findMany()` invocation: SELECT * FROM bookings", "req-2");
    expect(body.message).not.toContain("prisma");
    expect(body.message).not.toContain("SELECT");
    expect(body.message).toContain("req-2"); // so a support call can name the line in the log
    expect(body.statusCode).toBe(500);
  });
});
