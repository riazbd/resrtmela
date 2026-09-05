import { Body, Controller, Get, Post, Req, UseGuards, Inject, HttpCode } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { AuthGuard, AuthedRequest } from "../common/auth.guard";
import { AuthService } from "./auth.service";
import { PrismaService } from "../prisma/prisma.service";

export class LoginDto {
  @IsString() phone!: string;
  @IsString() @MinLength(6) password!: string;
}

class OtpRequestDto {
  @IsString() phone!: string;
}

class OtpVerifyDto {
  @IsString() phone!: string;
  @IsString() code!: string;
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
    return this.auth.loginWithPassword(dto.phone, dto.password);
  }

  @Post("otp/request")
  @HttpCode(200)
  requestOtp(@Body() dto: OtpRequestDto) {
    return this.auth.requestOtp(dto.phone);
  }

  @Post("otp/verify")
  @HttpCode(200)
  verifyOtp(@Body() dto: OtpVerifyDto) {
    return this.auth.verifyOtp(dto.phone, dto.code);
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
  ) {}

  @Get("me")
  me(@Req() req: AuthedRequest) {
    return this.auth.me(req.user.userId);
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
