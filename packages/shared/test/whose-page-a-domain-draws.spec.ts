/**
 * A request at somebody's own domain becomes their page (2026-09-17).
 */
import { describe, expect, it } from "vitest";
import { sitePathFor } from "../src/domain";

describe("the page a domain draws", () => {
  it("is a resort's under /r", () => {
    expect(sitePathFor({ kind: "resort", slug: "sky-eco" }, "/")).toBe("/r/sky-eco");
  });

  it("is an agency's under /a", () => {
    expect(sitePathFor({ kind: "agency", slug: "sea-breeze" }, "/")).toBe("/a/sea-breeze");
  });

  it("keeps the rest of the path", () => {
    expect(sitePathFor({ kind: "agency", slug: "sea-breeze" }, "/tours")).toBe("/a/sea-breeze/tours");
  });

  it("reads an answer with no kind as a resort's, as every lookup said before", () => {
    expect(sitePathFor({ slug: "sky-eco" }, "/")).toBe("/r/sky-eco");
  });
});
