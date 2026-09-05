import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Req, UseGuards, Inject } from "@nestjs/common";
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, MaxLength } from "class-validator";
import { AuthGuard, AuthedRequest } from "../common/auth.guard";
import { TenancyService } from "./tenancy.service";

class CreateTenantDto {
  @IsString() @MaxLength(120) name!: string;
  @IsString() @MaxLength(80) slug!: string;
  @IsOptional() @IsString() plan?: string;
}

class CreateResortDto {
  @IsInt() tenantId!: number;
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsBoolean() showRatesToAgents?: boolean;
}

class UpdateResortDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsBoolean() showRatesToAgents?: boolean;
  @IsOptional() @IsNumber() taxRatePct?: number;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() @MaxLength(12) invoicePrefix?: string;
  @IsOptional() @IsString() @MaxLength(16) checkInTime?: string;
  @IsOptional() @IsString() @MaxLength(16) checkOutTime?: string;
  @IsOptional() @IsString() @MaxLength(255) address?: string;
  @IsOptional() @IsString() @MaxLength(160) website?: string;
  @IsOptional() @IsString() @MaxLength(32) contactPhone?: string;
  @IsOptional() @IsString() @MaxLength(5) fyStartMonthDay?: string;
}

@Controller()
@UseGuards(AuthGuard)
export class TenancyController {
  constructor(@Inject(TenancyService) private readonly svc: TenancyService) {}

  @Get("resorts/mine")
  mine(@Req() req: AuthedRequest) {
    return this.svc.mine(req.user);
  }

  @Get("resorts/:id")
  detail(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    return this.svc.detail(req.user, id);
  }

  @Patch("resorts/:id")
  updateResort(
    @Req() req: AuthedRequest,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateResortDto,
  ) {
    return this.svc.updateResort(req.user, id, dto);
  }

  @Get("resorts/:id/fiscal-years")
  fiscalYears(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    return this.svc.fiscalYears(req.user, id);
  }

  @Get("tenants/:id/usage")
  usage(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    return this.svc.usage(req.user, id);
  }

  @Patch("tenants/:id/plan")
  updatePlan(
    @Req() req: AuthedRequest,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: { plan: string },
  ) {
    return this.svc.updatePlan(req.user, id, dto.plan);
  }

  // ── platform ops (super_admin only) ──
  @Get("tenants")
  listTenants(@Req() req: AuthedRequest) {
    return this.svc.listTenants(req.user);
  }

  @Post("tenants")
  createTenant(@Req() req: AuthedRequest, @Body() dto: CreateTenantDto) {
    return this.svc.createTenant(req.user, dto);
  }

  @Post("resorts")
  createResort(@Req() req: AuthedRequest, @Body() dto: CreateResortDto) {
    return this.svc.createResort(req.user, dto);
  }
}
