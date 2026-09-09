import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { AppModule } from "./app.module";
import { corsOrigins } from "./common/cors";
import { eventLogLine } from "./common/observability";

async function bootstrap() {
  // BigInt ids (subscription/api-key rows) must survive JSON serialization
  (BigInt.prototype as unknown as { toJSON(): string }).toJSON = function () {
    return (this as unknown as bigint).toString();
  };
  // A crash used to be invisible: PM2 restarted the process and the only
  // evidence was a gap in the log. Both handlers print one structured line
  // before anything else happens.
  process.on("unhandledRejection", (reason) => {
    console.error(
      eventLogLine("error", "unhandledRejection", {
        error: String((reason as Error)?.message ?? reason).slice(0, 500),
        stack: (reason as Error)?.stack?.split("\n").slice(0, 6).join(" | "),
      }),
    );
  });
  process.on("uncaughtException", (err) => {
    console.error(
      eventLogLine("error", "uncaughtException", {
        error: err.message.slice(0, 500),
        stack: err.stack?.split("\n").slice(0, 6).join(" | "),
      }),
    );
    // the process state is no longer trustworthy — let the supervisor restart it
    process.exit(1);
  });

  const app = await NestFactory.create(AppModule);
  console.log(
    eventLogLine("info", "boot", {
      cwd: process.cwd(),
      node: process.version,
      // presence, never contents: this line ends up in shared logs
      smtp: process.env.SMTP_HOST ? "configured" : "unconfigured",
      sms: process.env.SMS_API_KEY ? "configured" : "unconfigured",
    }),
  );
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  /**
   * One hop of reverse proxy, so `req.ip` is the caller and not nginx.
   *
   * Without this every request behind the proxy shares one address, which
   * turned the auth rate limiter from "30 attempts per caller" into "30
   * attempts for everybody" — one client could lock the whole platform out of
   * login. Exactly one hop is trusted: more would let a caller forge the
   * chain by sending their own X-Forwarded-For.
   */
  app.getHttpAdapter().getInstance().set("trust proxy", 1);

  // the allow-list, and the reason it is a function, are in common/cors.ts
  app.enableCors({ origin: corsOrigins(), credentials: true });
  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);
  console.log(eventLogLine("info", "listening", { port }));
}

void bootstrap();
