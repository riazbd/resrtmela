import { Injectable, Logger, OnModuleDestroy, Inject } from "@nestjs/common";
import { Prisma } from "@rh/db";
import { PrismaService } from "../prisma/prisma.service";

export type Tx = Prisma.TransactionClient;

interface AuditEntry {
  actorId?: number | null;
  resortId?: number | null;
  action: string;
  entity: string;
  entityId?: number | null;
  diff?: unknown;
}

@Injectable()
export class AuditService implements OnModuleDestroy {
  private readonly logger = new Logger(AuditService.name);
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Fire-and-forget inside requests; safe on tx clients too. */
  async log(entry: AuditEntry, tx?: Tx): Promise<void> {
    const client = tx ?? this.prisma;
    try {
      await client.auditLog.create({
        data: {
          actorId: entry.actorId ?? null,
          resortId: entry.resortId ?? null,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId != null ? BigInt(entry.entityId) : null,
          diff: (entry.diff as Prisma.InputJsonValue) ?? undefined,
        },
      });
    } catch (e) {
      this.logger.warn(`audit write failed: ${String(e)}`);
      if (tx) throw e; // don't swallow inside critical transactions
    }
  }

  async onModuleDestroy() {
    // PrismaService handles its own disconnect
  }
}
