import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards, Inject } from "@nestjs/common";
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { AuthGuard, AuthedRequest } from "../common/auth.guard";
import { PlatformService } from "./platform.service";

class SubscriptionDto {
  @IsIn(["STARTER", "GROWTH", "CHAIN"]) plan!: string;
  @IsOptional() @IsNumber() @Min(0) monthlyFee?: number;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
}

class ResortStatusDto {
  @IsIn(["active", "suspended"]) status!: string;
}

class RenewDto {
  @IsOptional() @IsInt() @Min(1) months?: number;
}

class PayDueDto {
  @IsOptional() @IsString() @MaxLength(24) method?: string;
}

class CreateUserDto {
  @IsString() @MaxLength(160) name!: string;
  @IsString() @MaxLength(32) phone!: string;
  @IsString() @MaxLength(128) password!: string;
  @IsIn(["MANAGER", "FRONT_DESK", "AGENT", "HOUSEKEEPING"]) role!: string;
  @IsOptional() @IsNumber() commissionRate?: number;
}

class UpdateUserDto {
  @IsOptional() @IsIn(["MANAGER", "FRONT_DESK", "AGENT", "HOUSEKEEPING", "RESORT_ADMIN"]) role?: string;
  @IsOptional() @IsIn(["active", "pending", "suspended"]) status?: string;
  @IsOptional() @IsString() @MaxLength(128) password?: string;
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @IsNumber() commissionRate?: number;
}

class AgentStatusDto {
  @IsIn(["active", "suspended", "pending"]) status!: string;
}

class WalletTxnDto {
  @IsIn(["TOPUP", "PAYOUT", "ADJUST", "COMMISSION"]) kind!: string;
  @IsNumber() amount!: number;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
}

class WalletPayDto {
  @IsNumber() @Min(1) amount!: number;
}

class DiscountDto {
  @IsIn(["RESORT", "ROOM"]) scope!: string;
  @IsOptional() @IsInt() roomTypeId?: number;
  @IsString() @MaxLength(120) name!: string;
  @IsIn(["PERCENT", "FLAT"]) kind!: string;
  @IsNumber() value!: number;
  @IsOptional() @IsString() validFrom?: string;
  @IsOptional() @IsString() validTo?: string;
}

class DiscountPatchDto {
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsNumber() value?: number;
  @IsOptional() @IsString() validFrom?: string;
  @IsOptional() @IsString() validTo?: string;
}

class ApiKeyDto {
  @IsString() @MaxLength(120) name!: string;
}

class EmailInvoiceDto {
  @IsOptional() @IsBoolean() print?: boolean;
}

@Controller()
@UseGuards(AuthGuard)
export class PlatformController {
  constructor(@Inject(PlatformService) private readonly platform: PlatformService) {}

  // super admin — platform
  @Get("platform/overview") overview(@Req() req: AuthedRequest) {
    return this.platform.overview(req.user);
  }
  @Get("platform/resorts") resorts(@Req() req: AuthedRequest) {
    return this.platform.allResorts(req.user);
  }
  @Get("platform/agents") agents(@Req() req: AuthedRequest) {
    return this.platform.allAgents(req.user);
  }
  @Patch("platform/resorts/:id/status") setResortStatus(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number, @Body() dto: ResortStatusDto) {
    return this.platform.setResortStatus(req.user, id, dto.status);
  }

  // super admin — subscriptions
  @Post("platform/resorts/:id/subscription") setSubscription(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number, @Body() dto: SubscriptionDto) {
    return this.platform.setSubscription(req.user, id, dto as never);
  }
  @Post("platform/subscriptions/:id/renew") renew(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number, @Body() dto: RenewDto) {
    return this.platform.renewSubscription(req.user, id, dto.months ?? 1);
  }
  @Post("platform/subscriptions/:id/cancel") cancel(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    return this.platform.cancelSubscription(req.user, id);
  }
  @Get("platform/dues") dues(@Req() req: AuthedRequest, @Query("resortId") resortId?: string, @Query("status") status?: string) {
    return this.platform.listDues(req.user, { resortId: resortId ? Number(resortId) : undefined, status });
  }
  @Post("platform/dues/:id/pay") payDue(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number, @Body() dto: PayDueDto) {
    return this.platform.payDue(req.user, id, dto.method);
  }
  @Get("platform/sub-calendar") subCalendar(@Req() req: AuthedRequest, @Query("from") from: string, @Query("to") to: string) {
    return this.platform.subscriptionCalendar(req.user, from, to);
  }

  // owner — users & roles
  @Get("resorts/:id/users") users(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    return this.platform.resortUsers(req.user, id);
  }
  @Post("resorts/:id/users") createUser(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number, @Body() dto: CreateUserDto) {
    return this.platform.createResortUser(req.user, id, dto);
  }
  @Patch("resorts/:id/users/:userId") updateUser(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number, @Param("userId", ParseIntPipe) userId: number, @Body() dto: UpdateUserDto) {
    return this.platform.updateResortUser(req.user, id, userId, dto);
  }
  @Get("resorts/:id/activity") activity(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number, @Query("take") take?: string) {
    return this.platform.activityLog(req.user, id, take ? Number(take) : 100);
  }

  // owner — agent activation
  @Patch("resorts/:id/agents/:userId/status") agentStatus(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number, @Param("userId", ParseIntPipe) userId: number, @Body() dto: AgentStatusDto) {
    return this.platform.setAgentStatus(req.user, id, userId, dto.status as "active" | "suspended" | "pending");
  }

  // wallets
  @Get("wallets/:userId") wallet(@Req() req: AuthedRequest, @Param("userId", ParseIntPipe) userId: number) {
    return this.platform.getWallet(req.user, userId);
  }
  @Post("wallets/:userId/txns") walletTxn(@Req() req: AuthedRequest, @Param("userId", ParseIntPipe) userId: number, @Body() dto: WalletTxnDto) {
    return this.platform.walletTxn(req.user, userId, dto.kind as never, dto.amount, dto.note);
  }
  @Post("bookings/:id/pay-from-wallet") payFromWallet(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number, @Body() dto: WalletPayDto) {
    return this.platform.payFromWallet(req.user, id, dto.amount);
  }

  // owner — discount offers
  @Get("resorts/:id/discounts") discounts(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    return this.platform.listDiscounts(req.user, id);
  }
  @Post("resorts/:id/discounts") createDiscount(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number, @Body() dto: DiscountDto) {
    return this.platform.createDiscount(req.user, id, dto as never);
  }
  @Patch("discounts/:id") patchDiscount(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number, @Body() dto: DiscountPatchDto) {
    return this.platform.updateDiscount(req.user, id, dto);
  }

  // owner — api keys
  @Get("resorts/:id/api-keys") apiKeys(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    return this.platform.listApiKeys(req.user, id);
  }
  @Post("resorts/:id/api-keys") createApiKey(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number, @Body() dto: ApiKeyDto) {
    return this.platform.createApiKey(req.user, id, dto.name);
  }
  @Delete("api-keys/:id") revokeKey(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    return this.platform.revokeApiKey(req.user, id);
  }

  // invoice email
  @Post("bookings/:id/email-invoice") emailInvoice(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number, @Body() _dto: EmailInvoiceDto) {
    return this.platform.emailInvoice(req.user, id);
  }
}
