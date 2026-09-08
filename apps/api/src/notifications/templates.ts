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

// ───────────────────────── whose name is on the mail ─────────────────────────

/**
 * A message about a stay is from the resort; a message about a subscription is
 * from the platform. Before this, every email went out as "Resort Mela:
 * booking confirmed" — the platform's name on the resort's message to their
 * own guest, with a subject made by replacing underscores in a template id.
 * The guest had never heard of the platform, and the resort was paying to put
 * someone else's brand in front of their customer.
 */
export interface PlatformIdentity {
  name: string;
  supportEmail?: string;
  supportPhone?: string;
}

export interface EmailEnvelope {
  fromName: string;
  subject: string;
}

/** Subject lines, written. {placeholders} come from the same data as the body. */
const SUBJECTS: Record<TemplateName, string> = {
  booking_confirmed: "Booking {code} confirmed — {resort}",
  booking_received: "We have your booking request {code} — {resort}",
  checkin_reminder: "See you tomorrow — {resort}",
  payment_receipt: "Payment received for {code} — {resort}",

  subscription_trial_ending: "{resort}: your trial ends {date}",
  subscription_invoice: "{resort}: invoice for {date}",
  subscription_overdue: "{resort}: invoice unpaid",
  subscription_suspending: "{resort} will be suspended on {date}",
  subscription_suspended: "{resort} is suspended",
  subscription_resumed: "{resort} is active again",
};

/** Platform-owned messages: about the account, not about a stay. */
function isPlatformMessage(template: TemplateName): boolean {
  return template.startsWith("subscription_");
}

export function emailEnvelope(
  template: TemplateName,
  data: Record<string, string | number | null | undefined>,
  platform: PlatformIdentity,
): EmailEnvelope {
  const resort = typeof data.resort === "string" ? data.resort.trim() : "";
  const fromName = isPlatformMessage(template) || !resort ? platform.name : resort;
  const subject = SUBJECTS[template].replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = data[key];
    return v === null || v === undefined ? "" : String(v);
  }).replace(/\s+—\s*$/, "").trim();
  return { fromName, subject };
}

/** Interpolated values are attacker-reachable (a guest picks their own name). */
function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The message, wrapped so it looks like it came from someone. Deliberately
 * plain HTML: this has to render in Gmail, Outlook and the stock Android mail
 * app, and every extra byte is a spam-score risk on a young sending domain.
 */
export function emailHtml(body: string, senderName: string, platform: PlatformIdentity): string {
  const contacts: string[] = [];
  if (platform.supportEmail?.trim()) {
    contacts.push(`<a href="mailto:${esc(platform.supportEmail.trim())}" style="color:#0f766e">${esc(platform.supportEmail.trim())}</a>`);
  }
  if (platform.supportPhone?.trim()) contacts.push(esc(platform.supportPhone.trim()));
  const support = contacts.length > 0 ? `<div style="margin-top:6px">Need help? ${contacts.join(" · ")}</div>` : "";
  return [
    '<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.6;color:#0f172a">',
    `<p style="margin:0 0 16px">${esc(body)}</p>`,
    '<div style="border-top:1px solid #e2e8f0;padding-top:12px;color:#64748b;font-size:12px">',
    `<div>${esc(senderName)}</div>`,
    support,
    "</div></div>",
  ].join("");
}
