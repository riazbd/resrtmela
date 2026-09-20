import { Body, Controller, Get, Post, Query, Req, UseGuards, Inject } from "@nestjs/common";
import { IsIn, IsInt, IsOptional, IsString, MaxLength } from "class-validator";
import { Type } from "class-transformer";
import { AuthGuard, AuthedRequest } from "../common/auth.guard";
import { NotificationsService } from "./notifications.service";
import { PushService } from "./push.service";
import { ROLE, type Role } from "@rh/shared";

class RecentQuery {
  @IsOptional() @Type(() => Number) @IsInt() take?: number;
}

/**
 * A phone asking to be told things.
 *
 * `platform` is checked rather than taken as given: it decides nothing
 * today, and an unchecked string column is how a free-text field ends up
 * holding nine spellings of "android".
 */
class DeviceDto {
  @IsString() @MaxLength(255) token!: string;
  @IsIn(["android", "ios"]) platform!: string;
}

class DispatchDto {
  @IsOptional() @IsInt() sweeps?: number;
}

@Controller()
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(PushService) private readonly push: PushService,
  ) {}

  /**
   * Whoever is holding this token is whoever is signed in.
   *
   * No resort in the path: a token belongs to a person, and the people it
   * is sent on behalf of are worked out at send time from the permission
   * matrix. A route that took a resort would let one be claimed.
   */
  @Post("devices")
  registerDevice(@Req() req: AuthedRequest, @Body() dto: DeviceDto) {
    return this.push.register(req.user.userId, dto.token, dto.platform);
  }

  /** Sign-out. Not optional — see the note on `forget`. */
  @Post("devices/forget")
  forgetDevice(@Req() req: AuthedRequest, @Body() dto: DeviceDto) {
    return this.push.forget(req.user.userId, dto.token);
  }

  @Get("notifications/recent")
  async recent(@Req() req: AuthedRequest, @Query() q: RecentQuery) {
    const allowed: Role[] = [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER];
    if (!allowed.includes(req.user.role)) {
      throw Object.assign(new Error("Staff only"), { status: 403 });
    }
    const rows = await this.notifications.recent(req.user, q.take ?? 50);
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
