/**
 * The brand is the owner's, and the page must survive whatever is in the row.
 */
import { describe, expect, it } from "vitest";
import { brandFrom, DEFAULT_BRAND } from "../src/lib/brand";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

describe("reading the brand a platform has set", () => {
  it("keeps a name, an inline image and an https link", () => {
    expect(brandFrom({ name: "Hotel Haat", icon: PNG, logo: "https://cdn.example/logo.svg" })).toEqual({
      name: "Hotel Haat",
      icon: PNG,
      logo: "https://cdn.example/logo.svg",
    });
  });

  it("falls back to the built-in brand when nothing is set", () => {
    expect(brandFrom({})).toEqual(DEFAULT_BRAND);
    expect(brandFrom(null)).toEqual(DEFAULT_BRAND);
    expect(brandFrom({ name: "   ", icon: "", logo: null })).toEqual(DEFAULT_BRAND);
  });

  it("drops anything an <img> should not be handed", () => {
    // a value typed into a form reaches every page; only images are rendered
    const b = brandFrom({ icon: "javascript:alert(1)", logo: "blob:https://x/y" });

    expect(b.icon).toBeNull();
    expect(b.logo).toBeNull();
  });

  it("ignores a name that is not text at all", () => {
    expect(brandFrom({ name: 42, icon: [] }).name).toBe(DEFAULT_BRAND.name);
  });
});
