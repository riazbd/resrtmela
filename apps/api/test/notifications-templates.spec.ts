import { describe, expect, it } from "vitest";
import { renderTemplate, dedupeKeyFor } from "../src/notifications/templates";

describe("notification templates", () => {
  it("renders placeholders with data", () => {
    const out = renderTemplate("booking_confirmed", {
      resort: "Sky Eco",
      code: "BK-00042",
      checkin: "2026-09-04",
      checkout: "2026-09-06",
      due: 12500,
    });
    expect(out).toBe(
      "Sky Eco: Booking BK-00042 CONFIRMED (2026-09-04 to 2026-09-06). Due Tk 12500. See you soon!",
    );
  });

  it("missing data renders ? instead of {key}", () => {
    const out = renderTemplate("payment_receipt", { resort: "X", code: "BK-1", amount: 500 });
    expect(out).toContain("via ?");
  });

  it("dedupe keys are stable and namespaced", () => {
    expect(dedupeKeyFor("checkin_reminder", "booking:7", "2026-09-04")).toBe(
      "checkin_reminder:booking:7:2026-09-04",
    );
    expect(dedupeKeyFor("payment_receipt", "booking:7")).toBe("payment_receipt:booking:7");
  });
});
