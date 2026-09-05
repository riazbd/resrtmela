import { Body, Controller, Get, Post, Query, Req, UseGuards, Inject } from "@nestjs/common";
import { IsInt, IsOptional } from "class-validator";
import { Type } from "class-transformer";
import { AuthGuard, AuthedRequest } from "../common/auth.guard";
import { NotificationsService } from "./notifications.service";
import { ROLE, type Role } from "@rh/shared";

class RecentQuery {
  @IsOptional() @Type(() => Number) @IsInt() take?: number;
}

class DispatchDto {
  @IsOptional() @IsInt() sweeps?: number;
}

@Controller()
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly notifications: NotificationsService) {}

  @Get("notifications/recent")
  async recent(@Req() req: AuthedRequest, @Query() q: RecentQuery) {
    const allowed: Role[] = [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER];
    if (!allowed.includes(req.user.role)) {
      throw Object.assign(new Error("Staff only"), { status: 403 });
    }
    const rows = await this.notifications.recent(q.take ?? 50);
    return rows.map((j) => ({
      id: Number(j.id),
      channel: j.channel,
      to: j.toRef,
      template: j.template,
      sent: j.sentAt !== null,
      attempts: j.attempts,
      lastError: j.lastError,
      sendAfter: j.sendAfter,
      sentAt: j.sentAt,
      payload: j.payload,
    }));
  }

  /** Manual dispatcher tick (dev/demo + ops nudge). */
  @Post("notifications/dispatch")
  async dispatch(@Req() req: AuthedRequest, @Body() dto: DispatchDto) {
    const allowed: Role[] = [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER];
    if (!allowed.includes(req.user.role)) {
      throw Object.assign(new Error("Staff only"), { status: 403 });
    }
    const sweeps = Math.min(dto.sweeps ?? 1, 5);
    const out = { sent: 0, swept: 0, failed: 0 };
    for (let i = 0; i < sweeps; i++) {
      const r = await this.notifications.tick();
      out.sent += r.sent;
      out.swept += r.swept;
      out.failed += r.failed;
    }
    return out;
  }
}
