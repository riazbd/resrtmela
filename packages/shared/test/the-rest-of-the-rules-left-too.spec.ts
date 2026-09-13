/**
 * The three modules that could not move unchanged.
 *
 * `contact.ts` imported `@rh/shared` from outside it, which is a relative
 * import once it is inside. `brand.ts` and `api-url.ts` each read
 * `process.env.NEXT_PUBLIC_API_URL` — a Next build-time substitution that does
 * not exist on a phone, where the address comes from `Constants.expoConfig`.
 *
 * The rule those two teach is worth stating: *where* a value comes from is the
 * host's business, and *what counts as a valid one* is shared. So the
 * normalisation moves and the lookup stays behind.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_BRAND,
  brandFrom,
  changedContactFields,
  displayEmail,
  displayPhone,
  emailError,
  fetchBrand,
  normalizeApiUrl,
  phoneError,
} from "../src/index";

describe("contact", () => {
  it("still catches what is obviously missing before a request is spent", () => {
    expect(emailError("")).toMatch(/required/i);
    expect(emailError("not-an-address")).toMatch(/does not look right/i);
    expect(emailError("owner@skyeco.example")).toBeNull();
    expect(phoneError("")).toMatch(/required/i);
    expect(phoneError("0171")).toMatch(/10 digits/i);
    expect(phoneError("8801711111111")).toBeNull();
  });

  it("still prints a migration placeholder as 'not set' rather than as a number", () => {
    expect(displayPhone("placeholder-42")).toBe("not set");
    expect(displayEmail("someone@placeholder.invalid")).toBe("not set");
    expect(displayPhone("8801711111111")).toBe("8801711111111");
  });

  it("still sends only what changed, and treats a placeholder as never-set", () => {
    expect(
      changedContactFields(
        { email: "owner@skyeco.example", phone: "8801711111111" },
        { email: "OWNER@skyeco.example", phone: "8801711111111" },
      ),
    ).toEqual({});
    expect(
      changedContactFields(
        { email: "owner@skyeco.example", phone: "8801711111111" },
        { email: "x@placeholder.invalid", phone: "placeholder-42" },
      ),
    ).toEqual({ email: "owner@skyeco.example", phone: "8801711111111" });
  });
});

describe("brand", () => {
  it("still refuses a src that is not an image or an https link", () => {
    expect(brandFrom({ name: "X", icon: "javascript:alert(1)" }).icon).toBeNull();
    expect(brandFrom({ icon: "https://example.test/a.png" }).icon).toBe("https://example.test/a.png");
    expect(brandFrom({ icon: "data:image/png;base64,AAA" }).icon).toBe("data:image/png;base64,AAA");
  });

  it("still falls back to the built-in mark when nothing is set", () => {
    expect(brandFrom({}).name).toBe(DEFAULT_BRAND.name);
    expect(brandFrom(null).name).toBe("Resort Mela");
  });

  /**
   * The signature change: `apiBase()` used to supply the default, reading an
   * env var that exists only in a Next build. The caller passes it now — and
   * because the caller must, a phone cannot silently fetch localhost while
   * reporting the built-in mark as though the server had answered.
   */
  it("goes to the address it was handed, not one it guessed", async () => {
    const calls: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url));
      return { ok: true, json: async () => ({ name: "Sky Eco" }) } as Response;
    }) as typeof fetch;
    try {
      const brand = await fetchBrand("https://api.resortmela.test");
      expect(calls).toEqual(["https://api.resortmela.test/cms/brand"]);
      expect(brand.name).toBe("Sky Eco");
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("still answers with the built-in mark when the API cannot be reached", async () => {
    await expect(fetchBrand("http://127.0.0.1:1")).resolves.toEqual(DEFAULT_BRAND);
  });

  /**
   * `cache: "no-store"` used to live inside this function. It is Next's word,
   * not fetch's — Node's RequestInit has no such field, which is how the API's
   * typecheck caught it — so the caller that needs it passes it through.
   */
  it("forwards the caller's fetch options untouched", async () => {
    let seen: RequestInit | undefined;
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      seen = init;
      return { ok: true, json: async () => ({}) } as Response;
    }) as typeof fetch;
    try {
      await fetchBrand("https://api.resortmela.test", { cache: "no-store" });
      expect(seen).toEqual({ cache: "no-store" });
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("normalizeApiUrl", () => {
  it("drops a trailing slash, so one join cannot produce a double one", () => {
    expect(normalizeApiUrl("https://api.resortmela.test/")).toBe("https://api.resortmela.test");
    expect(normalizeApiUrl("https://api.resortmela.test")).toBe("https://api.resortmela.test");
  });

  it("falls back to the development address when nothing was configured", () => {
    expect(normalizeApiUrl(undefined)).toBe("http://localhost:4000");
    expect(normalizeApiUrl("")).toBe("http://localhost:4000");
  });
});
