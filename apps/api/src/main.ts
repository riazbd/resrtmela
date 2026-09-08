import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { AppModule } from "./app.module";
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
  app.enableCors({
    origin: [
      /localhost:\d+$/,
      /resortmela\.app$/,
      ...(process.env.CORS_ORIGIN ? [process.env.CORS_ORIGIN] : []),
    ],
    credentials: true,
  });
  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);
  console.log(eventLogLine("info", "listening", { port }));
}

void bootstrap();
