import { Injectable, UnauthorizedException, Inject, Logger } from "@nestjs/common";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { signToken } from "../common/auth.guard";
import { normalizePhone } from "../common/dates";
import { slugify } from "../common/plans";
import { ensureResortRoles } from "../common/permissions";
import { SmsService } from "../notifications/sms.service";
import { EmailService } from "../notifications/email.service";
import { ROLE, type Role } from "@rh/shared";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_TTL_MS = 5 * 60_000;
const OTP_MAX_ATTEMPTS = 5;

const hashOtp = (code: string): string => createHash("sha256").update(code).digest("hex");

/** Constant-time compare so a wrong code cannot be narrowed by response timing. */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SmsService) private readonly sms: SmsService,
    @Inject(EmailService) private readonly email: EmailService,
  ) {}

  private readonly logger = new Logger(AuthService.name);

  /** Identifier may be a phone number or an email address. */
  async loginWithPassword(identifierRaw: string, password: string) {
    if (!identifierRaw) throw new UnauthorizedException("Invalid identifier or password");
    const looksEmail = identifierRaw.includes("@");
    const user = looksEmail
      ? await this.prisma.user.findFirst({ where: { email: identifierRaw.trim().toLowerCase() } })
      : await this.prisma.user.findUnique({ where: { phone: normalizePhone(identifierRaw) } });
    if (!user || !user.passwordHash || user.status !== "active") {
      throw new UnauthorizedException("Invalid identifier or password");
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Invalid identifier or password");
    return this.issueToken(user.id, user.role);
  }

  /**
   * Unified OTP request: guests verify by email (works today) or phone/SMS
   * (activates automatically once the SMS gateway gets a sender ID).
   */
  async requestOtp(input: { phone?: string; email?: string }) {
    const isEmail = !!input.email;
    if (!isEmail && !input.phone) throw Object.assign(new Error("phone or email required"), { status: 400 });
    if (isEmail && !EMAIL_RE.test(input.email!)) throw Object.assign(new Error("invalid email"), { status: 400 });

    const key = isEmail ? `email:${input.email!.trim().toLowerCase()}` : normalizePhone(input.phone!);
    // randomInt is drawn from the CSPRNG; Math.random is predictable enough to
    // guess a six-digit code from a couple of observed ones.
    const code = String(randomInt(100000, 1000000));
    const record = { codeHash: hashOtp(code), expiresAt: new Date(Date.now() + OTP_TTL_MS), attempts: 0 };
    await this.prisma.otpCode.upsert({
      where: { identifier: key },
      create: { identifier: key, ...record },
      update: record,
    });
    // opportunistic cleanup so the table cannot grow without bound
    await this.prisma.otpCode.deleteMany({ where: { expiresAt: { lt: new Date() } } });

    if (isEmail) {
      const email = input.email!.trim().toLowerCase();
      const r = await this.email.send(
        email,
        `Resort Mela verification code`,
        `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;color:#0f172a">
           <p>Your Resort Mela verification code is:</p>
           <p style="font-size:30px;font-weight:bold;letter-spacing:6px;color:#047857">${code}</p>
           <p style="color:#64748b;font-size:13px">Valid for 5 minutes. If you didn't request this, ignore this email.</p>
         </div>`,
      );
      if (!r.sent) {
        this.logger.warn(`OTP email not delivered to ${email}: ${r.error}`);
        const allowFallback = process.env.SMS_DEV_FALLBACK === "1";
        return { sent: false, channel: "email", expiresInSeconds: 300, devCode: allowFallback ? code : undefined };
      }
      return { sent: true, channel: "email", expiresInSeconds: 300 };
    }

    // SMS path (works once the gateway has an approved sender ID)
    const phone = normalizePhone(input.phone!);
    const r = await this.sms.send(phone, `Resort Mela: your verification code is ${code}. Valid for 5 minutes.`);
    if (!r.sent) {
      this.logger.warn(`OTP SMS not delivered to ${phone}: ${r.error}`);
      if (process.env.NODE_ENV === "production") {
        // don't leak codes: only expose devCode when SMS truly cannot be sent AND an override allows it
        const allowFallback = process.env.SMS_DEV_FALLBACK === "1";
        return {
          sent: false,
          channel: "sms",
          expiresInSeconds: 300,
          devCode: allowFallback ? code : undefined,
        };
      }
    }
    return {
      sent: r.sent,
      channel: "sms",
      expiresInSeconds: 300,
      devCode: process.env.NODE_ENV === "production" ? undefined : code,
    };
  }

  async verifyOtp(identifier: { phone?: string; email?: string }, code: string) {
    const isEmail = !!identifier.email;
    const key = isEmail ? `email:${identifier.email!.trim().toLowerCase()}` : normalizePhone(identifier.phone!);
    const entry = await this.prisma.otpCode.findUnique({ where: { identifier: key } });
    if (!entry) throw new UnauthorizedException("No OTP requested");
    if (entry.expiresAt.getTime() < Date.now()) {
      await this.prisma.otpCode.delete({ where: { identifier: key } });
      throw new UnauthorizedException("OTP expired");
    }
    if (entry.attempts >= OTP_MAX_ATTEMPTS) throw new UnauthorizedException("Too many attempts");
    if (!timingSafeEqualHex(entry.codeHash, hashOtp(code))) {
      await this.prisma.otpCode.update({
        where: { identifier: key },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException("Wrong code");
    }
    // single use: consume before issuing a session so the code cannot be replayed
    await this.prisma.otpCode.delete({ where: { identifier: key } });

    let user: { id: number; role: Role; status: string } | null;
    if (isEmail) {
      const email = identifier.email!.trim().toLowerCase();
      user = await this.prisma.user.findFirst({ where: { email } });
      if (!user) {
        user = await this.prisma.user.create({
          data: {
            name: email.split("@")[0]!,
            email,
            role: ROLE.GUEST,
          },
        });
      }
    } else {
      const phone = normalizePhone(identifier.phone!);
      user = await this.prisma.user.findUnique({ where: { phone } });
      if (!user) {
        user = await this.prisma.user.create({
          data: { name: phone, phone, role: ROLE.GUEST },
        });
      }
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
      await ensureResortRoles(this.prisma, resort.id);
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
