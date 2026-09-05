import { Injectable, Logger } from "@nestjs/common";
import * as nodemailer from "nodemailer";

/**
 * SMTP email provider — works with Gmail (app password), hosting SMTP, or any
 * standard server. Zero vendor lock-in: credentials come from .env.
 * Unconfigured = dev mode: mail is logged to the console instead of sent.
 *
 * From-name is per-resort (the sending resort's own name, e.g. "Sky Eco Resort"),
 * sent through the platform's single SMTP account. SMTP_FROM in .env only
 * provides the platform-level fallback address.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  private getTransport(): nodemailer.Transporter | null {
    if (this.transporter) return this.transporter;
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) return null;
    this.transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT ?? 587) === 465,
      auth: { user, pass },
    });
    return this.transporter;
  }

  /** Platform fallback address (used only when no resort name is provided). */
  get fromAddress(): string {
    return process.env.SMTP_FROM || process.env.SMTP_USER || "resortmela@localhost";
  }

  get configured(): boolean {
    return this.getTransport() !== null;
  }

  /**
   * send(to, subject, html, fromName?)
   * fromName = the sending resort's name → `From: "Sky Eco Resort" <inbox@…>`.
   * Without it → `From: "Resort Mela" <inbox@…>`.
   */
  async send(
    to: string,
    subject: string,
    html: string,
    fromName?: string,
  ): Promise<{ sent: boolean; error?: string }> {
    const tx = this.getTransport();
    if (!tx) {
      this.logger.log(`[EMAIL:console] to=${to} subject="${subject}" (${html.length} bytes html)`);
      return { sent: false }; // dev mode — caller marks the job done
    }
    const name = fromName?.trim() || "Resort Mela";
    try {
      await tx.sendMail({ from: `"${name}" <${this.fromAddress}>`, to, subject, html });
      return { sent: true };
    } catch (e) {
      this.logger.warn(`email send failed to ${to}: ${String(e).slice(0, 200)}`);
      return { sent: false, error: String(e).slice(0, 300) };
    }
  }
}
