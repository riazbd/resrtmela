/** Pure template rendering — unit tested. Placeholders: {key} */

export const TEMPLATES = {
  booking_confirmed:
    "{resort}: Booking {code} CONFIRMED ({checkin} to {checkout}). Due Tk {due}. See you soon!",
  booking_received:
    "{resort}: We received your booking request {code} ({checkin} to {checkout}). The resort will confirm shortly.",
  checkin_reminder:
    "{resort}: Reminder - your check-in is tomorrow ({checkin}). Booking {code}. Due at resort Tk {due}.",
  payment_receipt:
    "{resort}: Tk {amount} received for {code} via {method}. Remaining due Tk {due}. Thank you!",

  // ── platform -> tenant, about their own subscription ──
  // Deliberately not tenant-editable: a resort should not be able to rewrite
  // its own suspension notice. {platform} comes from platform settings.
  subscription_trial_ending:
    "{platform}: your free trial for {resort} ends on {date} ({days} days). Your {plan} plan is Tk {amount}/month after that. Nothing is lost either way.",
  subscription_invoice:
    "{platform}: invoice for {resort} — Tk {amount} for {date} to {periodEnd} ({plan} plan). Pay from Billing in your dashboard.",
  subscription_overdue:
    "{platform}: the Tk {amount} invoice for {resort}, due {date}, is unpaid. Please settle it to keep the account running.",
  subscription_suspending:
    "{platform}: {resort} will be suspended on {date} ({days} days) unless the Tk {amount} invoice is paid. Your data stays safe and readable either way.",
  subscription_suspended:
    "{platform}: {resort} is suspended — the Tk {amount} invoice due {date} is unpaid. Your records stay readable and exportable. Pay to resume immediately.",
  subscription_resumed:
    "{platform}: payment received — {resort} is active again. Thank you.",
} as const;

export type TemplateName = keyof typeof TEMPLATES;

export function renderTemplate(
  template: TemplateName,
  data: Record<string, string | number | null | undefined>,
): string {
  return TEMPLATES[template].replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = data[key];
    return v === null || v === undefined ? "?" : String(v);
  });
}

/** Build the dedupe key so repeated sweeps never double-send. */
export function dedupeKeyFor(
  template: TemplateName,
  ref: string,
  extra?: string,
): string {
  return extra ? `${template}:${ref}:${extra}` : `${template}:${ref}`;
}
