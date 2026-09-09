import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { normalizePhone } from "../common/dates";

/**
 * SMS provider: SSL Wireless iSMS Plus (https://ismsplus.sslwireless.com).
 * Auth: panel user + SHA-256 password hash + approved sender id (sid).
 * Env: SMS_API_URL, SMS_API_USER, SMS_API_PASS (plain — hashed here), SMS_SENDER_ID.
 * Unconfigured = dev mode: SMS is logged to the console instead of sent.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  private get configured(): boolean {
    return Boolean(process.env.SMS_API_URL && process.env.SMS_API_USER && process.env.SMS_API_PASS && process.env.SMS_SENDER_ID);
  }

  /** detect Bangla characters → unicode lang flag */
  private langFor(text: string): "EN" | "BN" {
    return /[\u0980-\u09FF]/.test(text) ? "BN" : "EN";
  }

  async send(toRaw: string, text: string): Promise<{ sent: boolean; error?: string }> {
    // one normaliser, so the gateway and the database always agree about what
    // a number is — this had its own copy of the 880 rule
    const msisdn = normalizePhone(toRaw);
    if (msisdn.length < 11) return { sent: false, error: "invalid msisdn" };

    if (!this.configured) {
      this.logger.log(`[SMS:console] to=${msisdn}: ${text.slice(0, 80)}`);
      return { sent: false, error: "sms-not-configured" };
    }

    const hash = createHash("sha256").update(process.env.SMS_API_PASS!).digest("hex");
    const body = {
      user: process.env.SMS_API_USER,
      hash,
      sid: process.env.SMS_SENDER_ID,
      msisdn,
      sms: text,
      lang: this.langFor(text),
      csms_id: randomUUID().replace(/-/g, "").slice(0, 24),
    };
    try {
      const res = await fetch(process.env.SMS_API_URL!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { status?: string; sms_id?: number | string; error_message?: string };
      if (data.status?.toUpperCase() === "SUCCESS" || data.status === "success" || data.sms_id) {
        return { sent: true };
      }
      this.logger.warn(`[SMS:failed] to=${msisdn}: ${JSON.stringify(data).slice(0, 200)}`);
      return { sent: false, error: data.error_message ?? JSON.stringify(data).slice(0, 200) };
    } catch (e) {
      this.logger.error(`[SMS:error] to=${msisdn}: ${String(e).slice(0, 200)}`);
      return { sent: false, error: String(e).slice(0, 200) };
    }
  }
}
