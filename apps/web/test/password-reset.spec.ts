/**
 * What the reset screen decides for itself.
 *
 * The API already refuses a short password and an expired token, in prose
 * meant to be read. This is the smaller check in front of it — the two
 * fields disagreeing, or the password being short — which the screen catches
 * before spending a request on it, and the one line of copy the "forgot
 * password" form always shows, whether or not the address has an account.
 * That sentence is written once here so the form cannot phrase it two ways
 * in two places, and cannot accidentally say something an attacker could use
 * to tell accounts apart.
 */
import { describe, expect, it } from "vitest";
import { newPasswordError, RESET_REQUESTED_MESSAGE } from "../src/lib/password-reset";

describe("newPasswordError", () => {
  it("accepts a password that is long enough and confirmed correctly", () => {
    expect(newPasswordError("longenough1", "longenough1")).toBeNull();
  });

  it("rejects a password under 8 characters", () => {
    expect(newPasswordError("short1", "short1")).toBe("Password must be at least 8 characters.");
  });

  it("rejects a confirmation that does not match", () => {
    expect(newPasswordError("longenough1", "somethingelse")).toBe("Passwords do not match.");
  });

  it("checks length before checking the match, so a short mismatch gets the length message", () => {
    expect(newPasswordError("short1", "short2")).toBe("Password must be at least 8 characters.");
  });
});

describe("RESET_REQUESTED_MESSAGE", () => {
  it("is the one sentence the forgot-password form shows, whatever the address turns out to be", () => {
    // the API never reveals whether an account exists (Task 1); the screen
    // must not undo that by phrasing success and "no such account" differently
    expect(RESET_REQUESTED_MESSAGE).toBe(
      "If that address has an account, a reset link is on its way.",
    );
  });
});
