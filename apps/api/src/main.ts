import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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
  console.log(`[api] Resort Mela API listening on http://localhost:${port}`);
}

void bootstrap();
