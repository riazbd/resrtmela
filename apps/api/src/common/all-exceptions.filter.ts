import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Response } from "express";

/** Translates { status } tagged errors (from rbac helpers / services) + HttpExceptions. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (exception instanceof HttpException) {
      return res
        .status(exception.getStatus())
        .json(
          typeof exception.getResponse() === "object"
            ? exception.getResponse()
            : { message: exception.message },
        );
    }
    const status =
      (exception as { status?: number }).status ?? HttpStatus.INTERNAL_SERVER_ERROR;
    const message = (exception as Error).message ?? "Internal error";
    if (status >= 500) console.error(exception);
    res.status(status).json({
      statusCode: status,
      message,
      ...(status >= 500 ? {} : {}),
    });
  }
}
