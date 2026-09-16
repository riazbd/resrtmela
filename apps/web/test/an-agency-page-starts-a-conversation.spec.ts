/**
 * An agency's page ends in a message, not a booking (2026-09-17 design, §1).
 *
 * Every button on it is a link to the agency — WhatsApp, a phone call — so the
 * links are the page's whole job, and a number typed with spaces and a plus
 * sign must still reach a phone.
 */
import { describe, expect, it } from "vitest";
import { enquiry, telLink, whatsappLink } from "../src/components/agency-site/contact";

describe("a WhatsApp link", () => {
  it("is the same link however the number was typed", () => {
    expect(whatsappLink("+880 1711-000000")).toBe("https://wa.me/8801711000000");
    expect(whatsappLink("8801711000000")).toBe("https://wa.me/8801711000000");
  });

  it("carries the message, encoded", () => {
    expect(whatsappLink("8801711000000", "Hi & hello")).toBe("https://wa.me/8801711000000?text=Hi%20%26%20hello");
  });

  it("is nothing when there is no number", () => {
    expect(whatsappLink(null)).toBeNull();
    expect(whatsappLink("n/a")).toBeNull();
  });
});

describe("a phone link", () => {
  it("keeps only what a dialler reads", () => {
    expect(telLink("+880 1711-000000")).toBe("tel:+8801711000000");
    expect(telLink("")).toBeNull();
  });
});

describe("the first line of an enquiry", () => {
  it("says what the guest was looking at, and when", () => {
    expect(enquiry("Sky Trips", "Sky Eco Resort", { from: "2026-10-01", to: "2026-10-03" })).toBe(
      "Hello Sky Trips, I found you on your website. I am interested in Sky Eco Resort from 2026-10-01 to 2026-10-03.",
    );
  });
});
