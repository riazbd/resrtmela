/**
 * What a webhook says, and what each one means (2026-09-15 design, §6).
 *
 * The vocabulary only. The signing lives in the API — `webhook-signature.ts` —
 * because this package is bundled for the browser and `node:crypto` in it takes
 * the console down, which is a lesson this file is keeping.
 */

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
