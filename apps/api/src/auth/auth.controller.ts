import { Body, Controller, Get, Post, Req, UseGuards, Inject, HttpCode, Query } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { AuthGuard, AuthedRequest } from "../common/auth.guard";
import { PermissionsService } from "../common/permissions";
import { PlanLimitsService } from "../common/plan-limits.service";
import { AuthService } from "./auth.service";
import { PrismaService } from "../prisma/prisma.service";

export class LoginDto {
  /** phone number OR email — one identifier is enough */
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() @MaxLength(191) email?: string;
  @IsOptional() @IsString() identifier?: string;
  @IsString() @MinLength(6) password!: string;
}

class OtpRequestDto {
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsString() @MaxLength(191) email?: string;
}

class OtpVerifyDto {
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsString() @MaxLength(191) email?: string;
  @IsString() @MaxLength(8) code!: string;
}

class SetPasswordDto {
  @IsString() @MinLength(8) newPassword!: string;
  @IsOptional() @IsString() currentPassword?: string;
}

class SignupDto {
  @IsString() @MaxLength(120) companyName!: string;
  @IsString() @MaxLength(160) resortName!: string;
  @IsOptional() @IsString() @MaxLength(255) location?: string;
  @IsString() @MaxLength(160) name!: string;
  @IsString() phone!: string;
  @IsString() @MinLength(8) password!: string;
  @IsOptional() @IsString() @MaxLength(80) slug?: string;
}

@Controller("auth")
export class PublicAuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post("login")
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    const id = dto.identifier ?? dto.phone ?? dto.email;
    return this.auth.loginWithPassword(id ?? "", dto.password);
  }

  @Post("otp/request")
  @HttpCode(200)
  requestOtp(@Body() dto: OtpRequestDto) {
    if (!dto.phone && !dto.email) {
      throw Object.assign(new Error("phone or email required"), { status: 400 });
    }
    return this.auth.requestOtp({ phone: dto.phone, email: dto.email });
  }

  @Post("otp/verify")
  @HttpCode(200)
  verifyOtp(@Body() dto: OtpVerifyDto) {
    if (!dto.phone && !dto.email) {
      throw Object.assign(new Error("phone or email required"), { status: 400 });
    }
    return this.auth.verifyOtp({ phone: dto.phone, email: dto.email }, dto.code);
  }

  /** Public self-serve onboarding: tenant + resort + admin account. */
  @Post("signup")
  @HttpCode(201)
  signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto);
  }
}

@Controller("auth")
@UseGuards(AuthGuard)
export class AuthedAuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PermissionsService) private readonly perms: PermissionsService,
    @Inject(PlanLimitsService) private readonly planLimits: PlanLimitsService,
  ) {}

  @Get("me")
  me(@Req() req: AuthedRequest) {
    return this.auth.me(req.user.userId);
  }

  /**
   * What this person may do in the active resort, for the console to draw with.
   *
   * Two answers, because there are two reasons a screen might not be theirs:
   * `permissions` is what the owner gave them, `features` is what the resort's
   * plan includes. The console used to know only the first, so a resort on a
   * plan without the restaurant still had "Restaurant" in its sidebar and met a
   * 403 on arriving. One request, since it is one question.
   */
  @Get("permissions")
  async permissions(@Req() req: AuthedRequest, @Query("resortId") resortIdRaw?: string) {
    const resortId = resortIdRaw ? Number(resortIdRaw) : undefined;
    return {
      permissions: await this.perms.resolve(req.user, resortId),
      features: resortId ? await this.planLimits.featuresFor(resortId) : [],
    };
  }

  @Post("me/password")
  @HttpCode(200)
  async setPassword(@Req() req: AuthedRequest, @Body() dto: SetPasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: req.user.userId },
    });
    if (user.passwordHash) {
      if (!dto.currentPassword) {
        throw Object.assign(new Error("currentPassword required"), { status: 400 });
      }
      const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
      if (!ok) throw Object.assign(new Error("Wrong current password"), { status: 400 });
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(dto.newPassword, 12) },
    });
    return { updated: true };
  }
}
