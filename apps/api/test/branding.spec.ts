/**
 * Whose name is on the mail.
 *
 * Every email left here as "Resort Mela: booking confirmed" — the platform's
 * name on the resort's message to their own guest, and a subject line made by
 * replacing underscores in a template id. The guest had never heard of Resort
 * Mela; the resort was paying for software that put someone else's brand in
 * front of their customer.
 *
 * The rule this file holds: a message about a stay is from the resort, a
 * message about a subscription is from the platform, and a subject line is
 * written, not generated.
 */
import { describe, expect, it } from "vitest";
import { emailEnvelope, emailHtml } from "../src/notifications/templates";

const platform = { name: "Resort Mela", supportEmail: "", supportPhone: "" };

describe("email envelope", () => {
  it("sends a booking confirmation as the resort, not as the platform", () => {
    const e = emailEnvelope("booking_confirmed", { resort: "Sky Eco Resort", code: "BK-00042" }, platform);
    expect(e.fromName).toBe("Sky Eco Resort");
    expect(e.subject).toBe("Booking BK-00042 confirmed — Sky Eco Resort");
  });

  it("writes a subject a guest would open, not a template id", () => {
    const e = emailEnvelope("checkin_reminder", { resort: "Sky Eco Resort", checkin: "2026-09-04" }, platform);
    expect(e.subject).not.toContain("_");
    expect(e.subject).toContain("tomorrow");
  });

  it("sends subscription mail as the platform, because that is who is owed", () => {
    const e = emailEnvelope("subscription_suspended", { resort: "Sky Eco Resort" }, platform);
    expect(e.fromName).toBe("Resort Mela");
    expect(e.subject).toContain("Sky Eco Resort");
  });

  it("takes the platform name from settings, so a rebrand is not a deploy", () => {
    const e = emailEnvelope("subscription_invoice", { resort: "X" }, { ...platform, name: "Hotel Bhai" });
    expect(e.fromName).toBe("Hotel Bhai");
  });

  it("falls back to the platform when a template arrives without a resort name", () => {
    const e = emailEnvelope("booking_confirmed", { code: "BK-1" }, platform);
    expect(e.fromName).toBe("Resort Mela");
  });
});

describe("email body", () => {
  it("signs off with the sender, and only shows support contacts the platform has set", () => {
    const withNone = emailHtml("Your booking is confirmed.", "Sky Eco Resort", platform);
    expect(withNone).toContain("Sky Eco Resort");
    expect(withNone).not.toContain("mailto:");

    const withSupport = emailHtml("Bill unpaid.", "Resort Mela", {
      ...platform,
      supportEmail: "help@example.com",
    });
    expect(withSupport).toContain("mailto:help@example.com");
  });

  it("escapes what it interpolates, so a resort name cannot inject markup", () => {
    const html = emailHtml("hi", '<script>alert(1)</script>', platform);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
