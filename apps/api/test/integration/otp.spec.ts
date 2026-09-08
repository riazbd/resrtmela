/**
 * Login codes must outlive the process that issued them. They were held in a
 * per-instance Map, so an API restart silently invalidated every code in
 * flight, and a second process would never see codes issued by the first.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb } from "../helpers/db";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { AuthService } from "../../src/auth/auth.service";
import { SmsService } from "../../src/notifications/sms.service";
import { EmailService } from "../../src/notifications/email.service";
import { PlatformSettingsService } from "../../src/common/platform-settings.service";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;

/** A fresh instance stands in for a restarted API process. */
const newAuthService = () =>
  new AuthService(asPrismaService, new SmsService(), new EmailService(), new PlatformSettingsService(asPrismaService));

const PHONE = "8801799999999";

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  await prisma.$executeRawUnsafe("TRUNCATE TABLE `otp_codes`").catch(() => {});
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("OTP login codes", () => {
  it("still verifies after the process that issued the code restarts", async () => {
    const issued = await newAuthService().requestOtp({ phone: PHONE });
    expect(issued.devCode).toMatch(/^\d{6}$/);

    const afterRestart = newAuthService();
    const session = await afterRestart.verifyOtp({ phone: PHONE }, issued.devCode!);

    expect(session.accessToken).toBeTruthy();
    expect(session.user.role).toBe("GUEST");
  });

  it("never stores the code itself", async () => {
    const issued = await newAuthService().requestOtp({ phone: PHONE });

    const rows = await prisma.$queryRawUnsafe<{ codeHash: string }[]>(
      "SELECT codeHash FROM `otp_codes`",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.codeHash).not.toBe(issued.devCode);
    expect(rows[0]!.codeHash).toHaveLength(64);
  });

  it("rejects a wrong code and burns the code after five tries", async () => {
    const auth = newAuthService();
    await auth.requestOtp({ phone: PHONE });

    for (let i = 0; i < 5; i++) {
      await expect(auth.verifyOtp({ phone: PHONE }, "000000")).rejects.toThrow();
    }
    await expect(auth.verifyOtp({ phone: PHONE }, "000000")).rejects.toThrow(/Too many attempts/);
  });

  it("rejects an expired code", async () => {
    const issued = await newAuthService().requestOtp({ phone: PHONE });
    // an absolute past instant — NOW() is server-local, the column is UTC
    await prisma.$executeRawUnsafe("UPDATE `otp_codes` SET expiresAt = '2020-01-01 00:00:00'");

    await expect(newAuthService().verifyOtp({ phone: PHONE }, issued.devCode!)).rejects.toThrow(
      /expired/i,
    );
  });

  it("consumes the code so it cannot be replayed", async () => {
    const issued = await newAuthService().requestOtp({ phone: PHONE });
    await newAuthService().verifyOtp({ phone: PHONE }, issued.devCode!);

    await expect(newAuthService().verifyOtp({ phone: PHONE }, issued.devCode!)).rejects.toThrow();
  });
});
