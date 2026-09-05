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
