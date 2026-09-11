import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../notifications/email.service";
import { PlatformSettingsService } from "../common/platform-settings.service";
import { badRequest } from "../common/rbac";
import { findUserByIdentifier, isPlaceholderEmail } from "../common/contact";

const TTL_MS = 60 * 60 * 1000; // one hour
const MIN_PASSWORD = 8;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * The replacement for a door that used to open by accident: `verifyOtp`
 * issued a token for whatever role an identifier already held, so a manager
 * who forgot a password could sign in with a code instead. Once OTP goes,
 * this is the only way back in — deliberate, rather than a side effect of
 * something else.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EmailService) private readonly email: EmailService,
    @Inject(PlatformSettingsService) private readonly settings: PlatformSettingsService,
  ) {}

  /**
   * Always answers the same, whoever asked.
   *
   * A different reply for a known and an unknown identifier turns this
   * endpoint into a way to ask "does this person have an account here",
   * which is a question about the platform's customers that no stranger
   * should be able to put to it. That is all this guarantees — it does not
   * make a known and an unknown identifier take the same amount of time: the
   * known path waits on an insert and an email send that the unknown path
   * never reaches.
   */
  async request(identifier: string): Promise<{ sent: boolean }> {
    await this.issue(identifier);
    return { sent: true };
  }

  /**
   * Identifier may be a phone number or an email address — the same rule
   * `loginWithPassword` resolves one by. Whichever was typed, the link is
   * mailed to the account's email: SMS is dormant, and every account has an
   * email now, placeholder or real. A placeholder (`@placeholder.invalid`)
   * is a gap standing in for an address, not one — there is nobody to
   * deliver it to — so an account stuck with one is treated the same as an
   * account nobody has heard of.
   */
  private async issue(identifier: string): Promise<void> {
    const user = await findUserByIdentifier(this.prisma, identifier);
    if (!user || user.status !== "active" || isPlaceholderEmail(user.email)) return;
    const address = user.email;

    const raw = randomBytes(32).toString("hex");
    await this.prisma.passwordReset.create({
      data: { userId: user.id, tokenHash: hash(raw), expiresAt: new Date(Date.now() + TTL_MS) },
    });
    await this.prisma.passwordReset.deleteMany({ where: { expiresAt: { lt: new Date() } } });

    const platformName = await this.settings.str("platform.name", "Resort Mela");
    // same convention as the agent-invite and payment-return links: PUBLIC_WEB_URL,
    // falling back to the production console when it is unset (dev/test)
    const base = process.env.PUBLIC_WEB_URL ?? "https://resortmela.rootcodebd.com";
    const link = `${base}/reset?token=${raw}`;
    const r = await this.email.send(
      address,
      `${platformName} password reset`,
      `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;color:#0f172a">
         <p>Somebody asked to reset the password for your ${platformName} account.</p>
         <p><a href="${link}" style="color:#047857;font-weight:bold">Choose a new password</a></p>
         <p style="color:#64748b;font-size:13px">The link works once and expires in an hour. If this was not you, nothing has changed and you can ignore this.</p>
       </div>`,
      platformName,
    );
    if (!r.sent) this.logger.warn(`reset email not delivered to ${address}: ${r.error}`);
  }

  async reset(token: string, newPassword: string): Promise<{ ok: true }> {
    if (newPassword.length < MIN_PASSWORD) {
      throw badRequest(`Password must be at least ${MIN_PASSWORD} characters`);
    }
    const row = await this.prisma.passwordReset.findUnique({ where: { tokenHash: hash(token) } });
    if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
      throw badRequest("That reset link has expired or has already been used. Ask for a new one.");
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: row.userId },
        data: { passwordHash: await bcrypt.hash(newPassword, 12) },
      }),
      this.prisma.passwordReset.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    ]);
    return { ok: true };
  }
}
