import { Controller, Get, Inject } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * What an uptime check should actually ask.
 *
 * "Is the process listening" is the question that is easy to answer and the
 * one that never catches anything: the API stays up while the database is
 * unreachable, while the notification queue has been stuck for a day, and
 * while nobody has been billed for a week. So the check reports the state of
 * the things that fail quietly, and grades itself on them.
 *
 * Deliberately unauthenticated and deliberately free of numbers a competitor
 * could use — counts of stuck jobs, not counts of customers.
 */
@Controller("health")
export class HealthController {
  // NOTE: with tsx/esbuild runtime there is no emitDecoratorMetadata,
  // so all DI must use explicit tokens (@Inject(...)).
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  async health() {
    const startedAt = Date.now();
    let db = "up";
    let dbError: string | undefined;
    let dbLatencyMs: number | undefined;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - startedAt;
    } catch (e) {
      db = "down";
      dbError = `${(e as { name?: string }).name ?? "Error"}: ${
        String((e as Error).message ?? "").slice(0, 200)
      }`;
    }

    // A queue that stops draining is the failure nobody notices: guests simply
    // stop getting confirmations. "Stuck" means it has run out of retries.
    let stuckJobs: number | undefined;
    if (db === "up") {
      try {
        stuckJobs = await this.prisma.notificationJob.count({
          where: { sentAt: null, attempts: { gte: 3 } },
        });
      } catch {
        // a count failing is not worth failing the whole check over
      }
    }

    const degraded = db !== "up" || (stuckJobs ?? 0) > 0;
    return {
      status: db === "up" ? (degraded ? "degraded" : "ok") : "down",
      service: "resort-mela-api",
      db,
      ...(dbLatencyMs != null ? { dbLatencyMs } : {}),
      ...(dbError ? { dbError } : {}),
      ...(stuckJobs != null ? { stuckJobs } : {}),
      uptimeSec: Math.round(process.uptime()),
      time: new Date().toISOString(),
    };
  }
}
