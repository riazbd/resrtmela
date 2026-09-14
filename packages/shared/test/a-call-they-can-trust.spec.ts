/**
 * Proving a webhook came from us (2026-09-15 design, §6).
 *
 * A resort's website receives a POST saying a booking was cancelled. Anybody on
 * the internet can send that POST — the URL is in their own configuration and
 * will end up in a log, a screenshot or a former employee's memory — so without
 * a signature the endpoint is an instruction anybody can give.
 *
 * The rule is here, and pure, for the same reason the DNS rule is: it is
 * written twice, once by us and once by them, and the two have to agree
 * exactly. The documentation shows this function's own three lines.
 */
import { describe, expect, it } from "vitest";
import { signWebhook, webhookSignatureMatches } from "../src/webhook";

const BODY = JSON.stringify({ event: "booking.cancelled", code: "BK-00300" });

describe("signing a call", () => {
  it("is an sha256 HMAC, named so a reader knows what to compute", () => {
    expect(signWebhook(BODY, "a-secret")).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  it("is the same for the same body and secret, and different for either change", () => {
    const first = signWebhook(BODY, "a-secret");

    expect(signWebhook(BODY, "a-secret")).toBe(first);
    expect(signWebhook(BODY, "another-secret")).not.toBe(first);
    expect(signWebhook(BODY + " ", "a-secret")).not.toBe(first);
  });

  /**
   * The body exactly as it goes down the wire. Re-serialising JSON on either
   * side reorders keys and changes whitespace, and then a correct
   * implementation fails to verify — the most common way a webhook integration
   * is abandoned as "broken".
   */
  it("signs the bytes, not an idea of them", () => {
    const a = '{"b":2,"a":1}';
    const b = '{"a":1,"b":2}';

    expect(signWebhook(a, "s")).not.toBe(signWebhook(b, "s"));
  });
});

describe("checking one", () => {
  it("accepts the signature it produced", () => {
    expect(webhookSignatureMatches(BODY, signWebhook(BODY, "a-secret"), "a-secret")).toBe(true);
  });

  it("refuses the wrong secret, a changed body, and nonsense", () => {
    const good = signWebhook(BODY, "a-secret");

    expect(webhookSignatureMatches(BODY, good, "another-secret")).toBe(false);
    expect(webhookSignatureMatches(BODY + "!", good, "a-secret")).toBe(false);
    expect(webhookSignatureMatches(BODY, "sha256=nope", "a-secret")).toBe(false);
    expect(webhookSignatureMatches(BODY, "", "a-secret")).toBe(false);
    expect(webhookSignatureMatches(BODY, undefined, "a-secret")).toBe(false);
  });

  /**
   * A comparison that stops at the first wrong byte tells an attacker how much
   * of their guess was right. It costs nothing to not do that.
   */
  it("compares the whole thing however wrong it is", () => {
    const good = signWebhook(BODY, "a-secret");
    const nearly = good.slice(0, -1) + (good.endsWith("a") ? "b" : "a");

    expect(webhookSignatureMatches(BODY, nearly, "a-secret")).toBe(false);
  });
});
