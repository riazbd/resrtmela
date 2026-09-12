/**
 * The examples on the Billing policy form.
 *
 * These fields decide where a customer sends money and who they call about a
 * bill, and they start empty — which is right: the platform cannot guess a
 * bKash number. But an empty box with a label saying "Support phone" does not
 * say what shape the answer takes, and the owner is filling it in once, from
 * memory, months after anyone explained the format.
 *
 * So each carries a placeholder. A placeholder and a value are not the same
 * thing and the difference is the whole point here: a placeholder is greyed
 * out, is never submitted, and never reaches a buyer. A *stored* example does
 * reach them — a seeded "bKash (Merchant) 01711-000111" sat in production
 * looking exactly like a real merchant number, which is money sent nowhere.
 *
 * Hence the second test: an example must be visibly an example, not a number
 * somebody could mistake for the platform's own.
 */
import { describe, expect, it } from "vitest";
import { POLICY_FIELDS } from "@/app/(app)/platform/policy-fields";

const NEEDS_AN_EXAMPLE = ["platform.supportEmail", "platform.supportPhone"];

describe("the billing policy fields", () => {
  it("shows the owner what shape each answer takes", () => {
    for (const key of NEEDS_AN_EXAMPLE) {
      const field = POLICY_FIELDS.find((f) => f.key === key);
      expect(field, `${key} is not on the form`).toBeTruthy();
      expect(field!.placeholder, `${key} has no example`).toBeTruthy();
    }
  });

  it("marks every example as an example", () => {
    // "01711-000111" reads as the platform's own number; "e.g. 01XXXXXXXXX"
    // cannot be mistaken for one
    for (const f of POLICY_FIELDS) {
      if (!f.placeholder) continue;
      const looksReal = /\b(01\d{9}|01\d{4}-\d{6}|\+880\d{9,})\b/.test(f.placeholder);
      expect(looksReal, `"${f.placeholder}" could be read as a real number`).toBe(false);
    }
  });

  it("never ships a stored default for them — empty is the honest state", () => {
    // the value is the owner's; this file only describes the box it goes in
    for (const f of POLICY_FIELDS) {
      expect(f).not.toHaveProperty("value");
      expect(f).not.toHaveProperty("default");
    }
  });
});
