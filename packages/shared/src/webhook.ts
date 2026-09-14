/**
 * Proving a webhook came from us (2026-09-15 design, §6).
 *
 * A resort's website receives a POST saying a booking was cancelled. Anybody
 * can send that POST — the URL lives in their configuration and will end up in
 * a log or a screenshot — so without a signature the endpoint is an instruction
 * anybody may give.
 *
 * Pure and shared because it is written twice: once here, and once by whoever
 * builds the resort's site. The documentation shows these exact lines.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** What we put in `X-Resort-Signature`. Named so a reader knows what to compute. */
export function signWebhook(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

/**
 * Whether a signature belongs to this body and secret.
 *
 * The body must be the bytes that arrived, not a re-serialised object: JSON
 * round-tripped through a parser reorders keys and loses whitespace, and then a
 * correct implementation fails to verify — which is the most common reason a
 * webhook integration is abandoned as broken.
 */
export function webhookSignatureMatches(
  body: string,
  signature: string | undefined | null,
  secret: string,
): boolean {
  if (!signature) return false;
  const expected = Buffer.from(signWebhook(body, secret), "utf8");
  const given = Buffer.from(signature, "utf8");
  // a comparison that stops at the first wrong byte says how much of a guess
  // was right; the length check is the only early exit, and it leaks nothing
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

/** What we call, and what each one means. A closed list, like every vocabulary here. */
export const WEBHOOK_EVENTS = [
  { key: "booking.created", blurb: "A booking was made — by you, by an agency, or through the API" },
  { key: "booking.changed", blurb: "A booking moved: checked in, checked out, dates or rooms edited" },
  { key: "booking.cancelled", blurb: "A booking was cancelled or marked a no-show; its nights are free again" },
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]["key"];

const EVENT_KEYS = new Set<string>(WEBHOOK_EVENTS.map((e) => e.key));

export function isWebhookEvent(value: unknown): value is WebhookEvent {
  return typeof value === "string" && EVENT_KEYS.has(value);
}
