import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Request, Response } from "express";
import { errorBody, eventLogLine, scrubUrl } from "./observability";

/**
 * Translates { status } tagged errors (from rbac helpers / services) and
 * HttpExceptions into responses.
 *
 * Two things it does beyond that:
 *
 * - Every response carries the request id, so a user reporting a failure can
 *   quote a string that finds the exact line in the log.
 * - A 5xx no longer returns its internal message. Prisma puts the failing
 *   query in there, and it was going straight to the browser; the detail now
 *   goes to the log, and the caller gets the id.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request & { id?: string; user?: { userId?: number } }>();
    const requestId = req.id ?? "-";

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      if (status >= 500) this.logFailure(status, exception, req, requestId);
      return res
        .status(status)
        .json(
          typeof payload === "object"
            ? { ...(payload as object), requestId }
            : { ...errorBody(status, exception.message, requestId) },
        );
    }

    const status = (exception as { status?: number }).status ?? HttpStatus.INTERNAL_SERVER_ERROR;
    const message = (exception as Error).message ?? "Internal error";
    if (status >= 500) this.logFailure(status, exception, req, requestId);
    res.status(status).json(errorBody(status, message, requestId));
  }

  private logFailure(
    status: number,
    exception: unknown,
    req: Request & { user?: { userId?: number } },
    requestId: string,
  ) {
    console.error(
      eventLogLine("error", "unhandled", {
        id: requestId,
        status,
        method: req.method,
        url: scrubUrl(req.originalUrl ?? ""),
        userId: req.user?.userId ?? null,
        error: (exception as Error)?.message?.slice(0, 500),
        stack: (exception as Error)?.stack?.split("\n").slice(0, 6).join(" | "),
      }),
    );
  }
}
