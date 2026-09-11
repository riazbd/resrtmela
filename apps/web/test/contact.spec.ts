/**
 * What a form decides before it spends a request.
 *
 * Every account now has both an email and a phone (the owner's ruling,
 * 2026-09-11) and the API refuses to write one that is missing either — see
 * `apps/api/src/common/contact.ts`. This module is the small, pure check the
 * console's forms run first, so a person sees "an email is required" instead
 * of watching a submit button do nothing, or a 400 nobody explains. It is
 * deliberately lenient: a plausible email shape, a phone with at least 10
 * digits. The server normalises and has the final word (a duplicate, a
 * placeholder used as a new value) — this module only catches what is
 * obviously missing or malformed, and the placeholder recognisers so a
 * loaded row can show "not set" instead of the fake address underneath it.
 *
 * `changedContactFields` is the edit form's other decision: it sends only
 * what actually changed, and a placeholder on the loaded row does not count
 * as a stored value to match against — filling one in is always a change.
 */
import { describe, expect, it } from "vitest";
import {
  changedContactFields,
  displayEmail,
  displayPhone,
  emailError,
  isPlaceholderEmail,
  isPlaceholderPhone,
  phoneError,
} from "../src/lib/contact";

describe("emailError", () => {
  it("requires an email address", () => {
    expect(emailError("")).toBe("An email address is required.");
    expect(emailError("   ")).toBe("An email address is required.");
    expect(emailError(undefined)).toBe("An email address is required.");
  });

  it("rejects a value that does not look like an email", () => {
    expect(emailError("not-an-email")).toBe("That email address does not look right.");
    expect(emailError("missing-domain@")).toBe("That email address does not look right.");
    expect(emailError("no-at-sign.com")).toBe("That email address does not look right.");
  });

  it("accepts a plausible email", () => {
    expect(emailError("guest@example.com")).toBeNull();
    expect(emailError("  guest@example.com  ")).toBeNull();
  });
});

describe("phoneError", () => {
  it("requires a phone number", () => {
    expect(phoneError("")).toBe("A phone number is required.");
    expect(phoneError(undefined)).toBe("A phone number is required.");
  });

  it("rejects a phone with fewer than 10 digits", () => {
    expect(phoneError("12345")).toBe("A phone number needs at least 10 digits.");
    expect(phoneError("017-123")).toBe("A phone number needs at least 10 digits.");
  });

  it("accepts a phone with at least 10 digits, formatting characters aside", () => {
    expect(phoneError("01712345678")).toBeNull();
    expect(phoneError("+880 171-234-5678")).toBeNull();
  });
});

describe("isPlaceholderEmail / isPlaceholderPhone", () => {
  it("recognises the placeholders the API writes for a missing value", () => {
    // same shapes as apps/api/src/common/contact.ts: user-<id>@placeholder.invalid
    // and placeholder-<id> — a gap wearing a value, not a real address.
    expect(isPlaceholderEmail("user-42@placeholder.invalid")).toBe(true);
    expect(isPlaceholderPhone("placeholder-42")).toBe(true);
  });

  it("does not mistake a real address for a placeholder", () => {
    expect(isPlaceholderEmail("guest@example.com")).toBe(false);
    expect(isPlaceholderPhone("01712345678")).toBe(false);
  });

  it("treats a missing value as not a placeholder, so callers still ask for one", () => {
    expect(isPlaceholderEmail(null)).toBe(false);
    expect(isPlaceholderEmail(undefined)).toBe(false);
    expect(isPlaceholderPhone("")).toBe(false);
  });
});

describe("displayEmail / displayPhone", () => {
  // Fix round 1: every place in the console that prints a stored account's
  // email or phone shares this, so a migration placeholder never reaches a
  // screen as though someone had typed it — e.g. an agent access request
  // showing "placeholder-42" as though that were a real phone number.
  it("shows 'not set' for a placeholder", () => {
    expect(displayEmail("user-9@placeholder.invalid")).toBe("not set");
    expect(displayPhone("placeholder-9")).toBe("not set");
  });

  it("shows 'not set' for an empty or missing value", () => {
    expect(displayEmail("")).toBe("not set");
    expect(displayEmail(null)).toBe("not set");
    expect(displayEmail(undefined)).toBe("not set");
    expect(displayPhone("")).toBe("not set");
    expect(displayPhone(null)).toBe("not set");
    expect(displayPhone(undefined)).toBe("not set");
  });

  it("shows the real value otherwise", () => {
    expect(displayEmail("guest@example.com")).toBe("guest@example.com");
    expect(displayPhone("01712345678")).toBe("01712345678");
  });
});

describe("changedContactFields", () => {
  it("sends nothing when neither field changed", () => {
    const stored = { email: "guest@example.com", phone: "01712345678" };
    expect(changedContactFields(stored, stored)).toEqual({});
  });

  it("sends only the field that changed", () => {
    const stored = { email: "guest@example.com", phone: "01712345678" };
    expect(
      changedContactFields({ email: "new@example.com", phone: stored.phone }, stored),
    ).toEqual({ email: "new@example.com" });
    expect(
      changedContactFields({ email: stored.email, phone: "01799999999" }, stored),
    ).toEqual({ phone: "01799999999" });
  });

  it("sends both when both changed", () => {
    const stored = { email: "guest@example.com", phone: "01712345678" };
    expect(
      changedContactFields({ email: "new@example.com", phone: "01799999999" }, stored),
    ).toEqual({ email: "new@example.com", phone: "01799999999" });
  });

  it("is not fooled by a trimmed or re-cased email that is really the same", () => {
    const stored = { email: "guest@example.com", phone: "01712345678" };
    expect(
      changedContactFields({ email: "  Guest@Example.com  ", phone: stored.phone }, stored),
    ).toEqual({});
  });

  it("treats a placeholder on the loaded row as unset, so filling it in is a change", () => {
    const stored = { email: "user-42@placeholder.invalid", phone: "placeholder-42" };
    expect(
      changedContactFields({ email: "real@example.com", phone: "01712345678" }, stored),
    ).toEqual({ email: "real@example.com", phone: "01712345678" });
  });
});
