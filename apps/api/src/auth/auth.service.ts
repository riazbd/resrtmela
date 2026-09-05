import { Injectable, UnauthorizedException, Inject } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { signToken } from "../common/auth.guard";
import { normalizePhone } from "../common/dates";
import { slugify } from "../common/plans";
import { ROLE, type Role } from "@rh/shared";

interface OtpEntry {
  code: string;
  expiresAt: number;
  attempts: number;
}

@Injectable()
export class AuthService {
  /** dev-only OTP store; replaced by SMS provider + job queue in phase 6 */
  private otps = new Map<string, OtpEntry>();

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async loginWithPassword(phoneRaw: string, password: string) {
    const phone = normalizePhone(phoneRaw);
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user || !user.passwordHash || user.status !== "active") {
      throw new UnauthorizedException("Invalid phone or password");
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Invalid phone or password");
    return this.issueToken(user.id, user.role);
  }

  async requestOtp(phoneRaw: string) {
    const phone = normalizePhone(phoneRaw);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    this.otps.set(phone, {
      code,
      expiresAt: Date.now() + 5 * 60_000,
      attempts: 0,
    });
    // TODO phase 6: enqueue SMS via notification_jobs + BullMQ worker
    return {
      sent: true,
      expiresInSeconds: 300,
      devCode: process.env.NODE_ENV === "production" ? undefined : code,
    };
  }

  async verifyOtp(phoneRaw: string, code: string) {
    const phone = normalizePhone(phoneRaw);
    const entry = this.otps.get(phone);
    if (!entry) throw new UnauthorizedException("No OTP requested");
    if (Date.now() > entry.expiresAt) {
      this.otps.delete(phone);
      throw new UnauthorizedException("OTP expired");
    }
    if (entry.attempts >= 5) throw new UnauthorizedException("Too many attempts");
    if (entry.code !== code) {
      entry.attempts += 1;
      throw new UnauthorizedException("Wrong code");
    }
    this.otps.delete(phone);

    let user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) {
      user = await this.prisma.user.create({
        data: { name: phone, phone, role: ROLE.GUEST },
      });
    }
    if (user.status !== "active") throw new UnauthorizedException("User disabled");
    return this.issueToken(user.id, user.role);
  }

  me(userId: number) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        role: true,
        status: true,
        resorts: {
          select: {
            resort: { select: { id: true, name: true, tenantId: true } },
            commissionRate: true,
          },
        },
      },
    });
  }

  /**
   * Self-serve onboarding: creates tenant + first resort + resort_admin in one
   * transaction, then issues a token. Public.
   */
  async signup(input: {
    companyName: string;
    resortName: string;
    location?: string;
    name: string;
    phone: string;
    password: string;
    slug?: string;
  }) {
    const phone = normalizePhone(input.phone);
    if (input.password.length < 8) {
      throw Object.assign(new Error("Password must be at least 8 characters"), { status: 400 });
    }
    const slug = slugify(input.slug?.trim() || input.companyName || input.resortName);
    if (!slug) throw Object.assign(new Error("Company name is required"), { status: 400 });

    const [slugTaken, phoneTaken] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { slug } }),
      this.prisma.user.findUnique({ where: { phone } }),
    ]);
    if (slugTaken) throw Object.assign(new Error(`Workspace "${slug}" is already taken`), { status: 409 });
    if (phoneTaken) throw Object.assign(new Error("This phone already has an account — sign in instead"), { status: 409 });

    const passwordHash = await bcrypt.hash(input.password, 12);
    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: input.companyName || input.resortName, slug, plan: "FREE" },
      });
      const resort = await tx.resort.create({
        data: {
          tenantId: tenant.id,
          name: input.resortName,
          location: input.location,
          timezone: "Asia/Dhaka",
          currency: "BDT",
        },
      });
      const user = await tx.user.create({
        data: {
          name: input.name.trim() || phone,
          phone,
          role: "RESORT_ADMIN",
          passwordHash,
        },
      });
      await tx.userResort.create({ data: { userId: user.id, resortId: resort.id } });
      await tx.counter.create({ data: { resortId: resort.id, kind: "BOOKING", nextVal: 0 } });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          resortId: resort.id,
          action: "tenant.signup",
          entity: "tenant",
          entityId: BigInt(tenant.id),
          diff: { slug, resort: input.resortName },
        },
      });
      return { tenant, resort, user };
    });
    return this.issueToken(result.user.id, result.user.role);
  }

  private async issueToken(userId: number, role: Role) {
    let resortIds: number[] = [];
    if (role !== ROLE.SUPER_ADMIN) {
      const rows = await this.prisma.userResort.findMany({
        where: { userId },
        select: { resortId: true },
      });
      resortIds = rows.map((r) => r.resortId);
    }
    return {
      accessToken: signToken({ userId, role, resortIds }),
      tokenType: "Bearer",
      user: { id: userId, role, resortIds },
    };
  }
}
