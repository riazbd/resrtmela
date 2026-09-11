import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards, Inject } from "@nestjs/common";
import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { AuthGuard, AuthedRequest } from "../common/auth.guard";
import { PlatformService } from "./platform.service";
import { SubscriptionService } from "./subscription.service";
import { CommissionService } from "../common/commission.service";

class SubscriptionDto {
  // validated against the plan table, not a list baked into the build
  @IsString() @MaxLength(16) plan!: string;
  @IsOptional() @IsNumber() @Min(0) monthlyFee?: number;
  /** This resort's trial, when it differs from the plan's. 0 means none. */
  @IsOptional() @IsInt() @Min(0) trialDays?: number;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
}

/** What the resort pays every agent. One term, set by hand. */
class CommissionDto {
  @IsIn(["PERCENT", "FLAT"]) kind!: "PERCENT" | "FLAT";
  @IsNumber() @Min(0) rate!: number;
}

/**
 * A plan, as the Plans tab posts it.
 *
 * The bounds live in the service, next to the columns they protect, so that a
 * plan created by a script is held to the same rules as one typed into a form.
 * This layer only says what shape may arrive.
 */
class PlanDto {
  @IsString() @MaxLength(16) name!: string;
  @IsString() @MaxLength(40) label!: string;
  @IsNumber() @Min(0) monthlyFee!: number;
  @IsInt() @Min(1) maxRooms!: number;
  @IsInt() @Min(1) maxResorts!: number;
  @IsInt() @Min(0) trialDays!: number;
  @IsOptional() @IsInt() @Min(1) maxStaff?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) features?: string[];
  @IsOptional() @IsString() @MaxLength(200) blurb?: string;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsBoolean() highlight?: boolean;
}

/** The same, with everything optional — `name` included, so a rename is refused rather than ignored. */
class PlanPatchDto {
  @IsOptional() @IsString() @MaxLength(16) name?: string;
  @IsOptional() @IsString() @MaxLength(40) label?: string;
  @IsOptional() @IsNumber() @Min(0) monthlyFee?: number;
  @IsOptional() @IsInt() @Min(1) maxRooms?: number;
  @IsOptional() @IsInt() @Min(1) maxResorts?: number;
  @IsOptional() @IsInt() @Min(0) trialDays?: number;
  @IsOptional() @IsInt() @Min(1) maxStaff?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) features?: string[];
  @IsOptional() @IsString() @MaxLength(200) blurb?: string;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsBoolean() highlight?: boolean;
}

/** The owner asking to move plan. The plan table decides whether it exists. */
class ChangePlanDto {
  @IsString() @MaxLength(16) plan!: string;
}

class ResortStatusDto {
  @IsIn(["active", "suspended"]) status!: string;
  /** why, so the billing sweep can tell its own suspensions from a human's */
  @IsOptional() @IsString() @MaxLength(32) reason?: string;
}

class RenewDto {
  @IsOptional() @IsInt() @Min(1) months?: number;
}

class PayDueDto {
  @IsOptional() @IsString() @MaxLength(24) method?: string;
}

class CreateUserDto {
  @IsString() @MaxLength(160) name!: string;
  @IsString() @MaxLength(191) email!: string;
  @IsString() @MaxLength(32) phone!: string;
  @IsString() @MaxLength(128) password!: string;
  @IsIn(["MANAGER", "FRONT_DESK", "AGENT", "HOUSEKEEPING"]) role!: string;
  @IsOptional() @IsNumber() roleId?: number;
}

class UpdateUserDto {
  @IsOptional() @IsIn(["MANAGER", "FRONT_DESK", "AGENT", "HOUSEKEEPING", "RESORT_ADMIN"]) role?: string;
  @IsOptional() @IsIn(["active", "pending", "suspended"]) status?: string;
  @IsOptional() @IsString() @MaxLength(128) password?: string;
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @IsNumber() roleId?: number;
  // how the person signs in; the service refuses a blank one rather than
  // ignoring it, so a placeholder can be replaced but never emptied
  @IsOptional() @IsString() @MaxLength(191) email?: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
}

class RoleDto {
  @IsString() @MaxLength(60) name!: string;
  @IsArray() permissions!: string[];
}

class RolePatchDto {
  @IsOptional() @IsString() @MaxLength(60) name?: string;
  @IsOptional() @IsArray() permissions?: string[];
}

class InviteAgentDto {
  @IsString() email!: string;
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  // optional here because inviting someone who already has an account only
  // links them; the service requires it whenever the invite makes a new one
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
}

class AgentStaffDto {
  @IsString() @MaxLength(160) name!: string;
  @IsString() @MaxLength(191) email!: string;
  @IsString() @MaxLength(32) phone!: string;
  @IsString() @MaxLength(128) password!: string;
}

class OwnerResortDto {
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(255) location?: string;
}

class CmsDto {
  @IsString() @MaxLength(60) key!: string;
  @IsString() @MaxLength(4000) value!: string;
}

class AgentStatusDto {
  @IsIn(["active", "suspended", "pending"]) status!: string;
}

/**
 * The wallet is the agency's account with the platform, so these are the only
 * three things that can happen in it. `COMMISSION` was accepted here and is
 * not: what an agency earns from a resort is settled between those two.
 */
class WalletTxnDto {
  @IsIn(["TOPUP", "PAYOUT", "ADJUST"]) kind!: string;
  @IsNumber() amount!: number;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
}

class DiscountDto {
  @IsIn(["RESORT", "ROOM_TYPE", "ROOM"]) scope!: string;
  @IsOptional() @IsInt() roomTypeId?: number;
  /** one particular room, for ROOM scope */
  @IsOptional() @IsInt() roomId?: number;
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
  constructor(
    @Inject(PlatformService) private readonly platform: PlatformService,
    @Inject(SubscriptionService) private readonly subscriptions: SubscriptionService,
    @Inject(CommissionService) private readonly commission: CommissionService,
  ) {}

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
    return this.platform.setResortStatus(req.user, id, dto.status, dto.reason);
  }
  @Post("platform/users/:id/login-as") loginAs(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    return this.platform.loginAs(req.user, id);
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
  /** Subscription dues and one-off charges together — what each tenant owes. */
  @Get("platform/outstanding") outstanding(@Req() req: AuthedRequest) {
    return this.platform.outstanding(req.user);
  }

  @Get("platform/charges") charges(@Req() req: AuthedRequest, @Query("resortId") resortId?: string, @Query("status") status?: string) {
    return this.platform.charges(req.user, { resortId: resortId ? Number(resortId) : undefined, status });
  }

  @Post("platform/charges/:id/pay") payCharge(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number, @Body() dto: PayDueDto) {
    return this.platform.payCharge(req.user, id, dto.method);
  }

  @Post("platform/dues/:id/pay") payDue(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number, @Body() dto: PayDueDto) {
    return this.platform.payDue(req.user, id, dto.method);
  }
  @Get("platform/sub-calendar") subCalendar(@Req() req: AuthedRequest, @Query("from") from: string, @Query("to") to: string) {
    return this.platform.subscriptionCalendar(req.user, from, to);
  }
  @Post("platform/billing/sweep") sweepBilling(@Req() req: AuthedRequest) {
    return this.platform.runBillingSweep(req.user);
  }

  // platform policy — the commercial terms, editable without a deploy
  @Get("platform/settings") platformSettings(@Req() req: AuthedRequest) {
    return this.platform.getSettings(req.user);
  }
  @Patch("platform/settings") updatePlatformSettings(@Req() req: AuthedRequest, @Body() dto: Record<string, string>) {
    return this.platform.updateSettings(req.user, dto);
  }

  // plan definitions
  @Get("platform/plans") plans(@Req() req: AuthedRequest) {
    return this.platform.listPlans(req.user);
  }
  @Post("platform/plans") createPlan(@Req() req: AuthedRequest, @Body() dto: PlanDto) {
    return this.platform.createPlan(req.user, dto);
  }
  @Patch("platform/plans/:name") updatePlan(@Req() req: AuthedRequest, @Param("name") name: string, @Body() dto: PlanPatchDto) {
    return this.platform.updatePlan(req.user, name, dto);
  }
  @Delete("platform/plans/:name") deletePlan(@Req() req: AuthedRequest, @Param("name") name: string) {
    return this.platform.deletePlan(req.user, name);
  }

  // super admin — front-end CMS
  @Get("platform/cms") getCms(@Req() req: AuthedRequest) {
    return this.platform.getCms(req.user);
  }
  @Post("platform/cms") putCms(@Req() req: AuthedRequest, @Body() dto: CmsDto) {
    return this.platform.putCms(req.user, dto.key, dto.value);
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
  @Get("resorts/:id/activity") activity(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number, @Query("take") take?: string, @Query("q") q?: string) {
    return this.platform.activityLog(req.user, id, take ? Number(take) : 100, q);
  }
  @Delete("activity/:id") deleteActivity(@Req() req: AuthedRequest, @Param("id") id: string) {
    return this.platform.deleteActivity(req.user, id);
  }

  /**
   * owner — their own subscription
   *
   * Distinct from `PATCH /tenants/:id/plan`, which is the super admin moving a
   * tenant and writes `Tenant.plan`. This pair reads and writes the
   * subscription the billing sweep actually bills, and is gated on
   * `billing.view` / `billing.manage` rather than on being platform staff.
   */
  @Get("resorts/:id/subscription") subscription(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    return this.subscriptions.detail(req.user, id);
  }
  @Post("resorts/:id/subscription/plan") changePlan(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number, @Body() dto: ChangePlanDto) {
    return this.subscriptions.changePlan(req.user, id, dto.plan);
  }

  /**
   * owner — agent commission
   *
   * One rate for the resort, replacing a field that used to sit on every
   * agent's row. Reading it needs only resort access, because an agent has to
   * be able to see their own terms; setting it needs `agents.manage`.
   */
  @Get("resorts/:id/commission") commissionTerms(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    return this.commission.publicTermsFor(req.user, id);
  }
  @Post("resorts/:id/commission") setCommission(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number, @Body() dto: CommissionDto) {
    return this.commission.setTerms(req.user, id, dto);
  }

  // owner — permission roles (Paradox-style matrix)
  @Get("resorts/:id/roles") roles(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    return this.platform.listRoles(req.user, id);
  }
  @Post("resorts/:id/roles") createRole(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number, @Body() dto: RoleDto) {
    return this.platform.createRole(req.user, id, dto.name, dto.permissions);
  }
  @Patch("roles/:id") updateRole(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number, @Body() dto: RolePatchDto) {
    return this.platform.updateRole(req.user, id, dto);
  }
  @Delete("roles/:id") deleteRole(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    return this.platform.deleteRole(req.user, id);
  }

  // owner — invite agent by email
  @Post("resorts/:id/invite-agent") inviteAgent(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number, @Body() dto: InviteAgentDto) {
    return this.platform.inviteAgentByEmail(req.user, id, dto);
  }

  // agent — agency sub-users
  @Get("agent/staff") agentStaff(@Req() req: AuthedRequest) {
    return this.platform.agentStaffList(req.user);
  }
  @Post("agent/staff") addAgentStaff(@Req() req: AuthedRequest, @Body() dto: AgentStaffDto) {
    return this.platform.createAgentStaff(req.user, dto);
  }

  // owner — add another resort (plan-gated)
  @Post("tenants/:tenantId/resorts") ownerAddResort(@Req() req: AuthedRequest, @Param("tenantId", ParseIntPipe) tenantId: number, @Body() dto: OwnerResortDto) {
    return this.platform.ownerCreateResort(req.user, tenantId, dto);
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
    return this.platform.walletTxn(req.user, userId, dto.kind, dto.amount, dto.note);
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

  // late agent payment approval
  @Post("bookings/:id/approve-late") approveLate(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    return this.platform.approveLatePayment(req.user, id);
  }
}
