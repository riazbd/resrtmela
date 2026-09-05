import { Controller, Get, Inject } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Controller("health")
export class HealthController {
  // NOTE: with tsx/esbuild runtime there is no emitDecoratorMetadata,
  // so all DI must use explicit tokens (@Inject(...)).
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  async health() {
    let db = "up";
    let dbError: string | undefined;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (e) {
      db = "down";
      dbError = `${(e as { name?: string }).name ?? "Error"}: ${
        String((e as Error).message ?? "").slice(0, 200)
      }`;
    }
    return {
      status: db === "up" ? "ok" : "degraded",
      service: "resort-mela-api",
      db,
      ...(dbError ? { dbError } : {}),
      time: new Date().toISOString(),
    };
  }
}
