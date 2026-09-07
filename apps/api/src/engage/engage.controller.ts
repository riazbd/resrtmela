import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards, Inject } from "@nestjs/common";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Max, Min } from "class-validator";
import { AuthGuard, AuthedRequest } from "../common/auth.guard";
import { EngageService } from "./engage.service";

class AccessRequestDto {
  @IsOptional() @IsString() @MaxLength(255) note?: string;
}

class AccessDecisionDto {
  @IsIn(["APPROVE", "REJECT"]) decision!: string;
}

class PurchaseCreditsDto {
  @IsInt() @IsIn([500, 2000, 10000]) credits!: number;
}

class CampaignDto {
  @IsString() @MaxLength(200) subject!: string;
  @IsString() @MaxLength(20000) body!: string;
  @IsIn(["RESORT_GUESTS", "MY_GUESTS", "AGENTS"]) audience!: string;
  @IsOptional() @IsInt() @Min(1) resortId?: number;
}

class ReadDto {
  @IsOptional() @IsBoolean() all?: boolean;
}

@Controller()
@UseGuards(AuthGuard)
export class EngageController {
  constructor(@Inject(EngageService) private readonly engage: EngageService) {}

  // notifications
  @Get("notifications") list(@Req() req: AuthedRequest, @Query("take") take?: string) {
    return this.engage.listMine(req.user, take ? Number(take) : 50);
  }
  @Post("notifications/read") markRead(@Req() req: AuthedRequest, @Body() dto: ReadDto) {
    return dto.all ? this.engage.markAllRead(req.user) : this.engage.markAllRead(req.user);
  }
  @Post("notifications/:id/read") markOne(@Req() req: AuthedRequest, @Param("id") id: string) {
    return this.engage.markRead(req.user, id);
  }

  // agent — discover & request access
  @Get("agent/discover") discover(@Req() req: AuthedRequest) {
    return this.engage.discoverResorts(req.user);
  }
  @Post("agent/resorts/:id/access-request") requestAccess(@Req() req: AuthedRequest, @Param("id") id: string, @Body() dto: AccessRequestDto) {
    return this.engage.requestAccess(req.user, Number(id), dto.note);
  }

  // owner — access requests
  @Get("resorts/:id/access-requests") accessRequests(@Req() req: AuthedRequest, @Param("id") id: string) {
    return this.engage.listAccessRequests(req.user, Number(id));
  }
  @Post("access-requests/:id/decision") decide(@Req() req: AuthedRequest, @Param("id") id: string, @Body() dto: AccessDecisionDto) {
    return this.engage.decideAccess(req.user, id, dto.decision === "APPROVE");
  }

  // bulk email
  @Get("email-credits") credits(@Req() req: AuthedRequest) {
    return this.engage.myEmailCredits(req.user);
  }
  @Post("email-credits/purchase") purchase(@Req() req: AuthedRequest, @Body() dto: PurchaseCreditsDto) {
    return this.engage.purchaseCredits(req.user, dto.credits);
  }
  @Post("email-campaigns") send(@Req() req: AuthedRequest, @Body() dto: CampaignDto) {
    return this.engage.sendCampaign(req.user, dto as never);
  }
  @Get("email-campaigns") campaigns(@Req() req: AuthedRequest) {
    return this.engage.myCampaigns(req.user);
  }
}
