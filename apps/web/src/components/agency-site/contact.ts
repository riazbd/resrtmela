/**
 * How a stranger reaches an agency, as links.
 *
 * Pure so they can be tested: the WhatsApp number is whatever the agency typed,
 * and a link built from "+880 1711-000000" has to be the same link as one built
 * from "8801711000000", or half the buttons on somebody's page go nowhere.
 */

/** `https://wa.me/<digits>?text=…`, or null when there is no number to send to. */
export function whatsappLink(number: string | null | undefined, text?: string): string | null {
  const digits = (number ?? "").replace(/[^0-9]/g, "");
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** `tel:` with only what a dialler reads. */
export function telLink(number: string | null | undefined): string | null {
  const cleaned = (number ?? "").replace(/[^0-9+]/g, "");
  return cleaned.length >= 6 ? `tel:${cleaned}` : null;
}

/** The message an enquiry starts with, so the agency knows what the guest was looking at. */
export function enquiry(agency: string, about: string, dates?: { from: string; to: string }): string {
  const when = dates ? ` from ${dates.from} to ${dates.to}` : "";
  return `Hello ${agency}, I found you on your website. I am interested in ${about}${when}.`;
}
