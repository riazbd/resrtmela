/**
 * The templates a resort chooses between (2026-09-14 design, §5.2).
 *
 * Two or three finished layouts, not a builder. They differ in how they look
 * and are identical in what they are given, and that second half is the whole
 * contract: a template that reached for data the others cannot have would make
 * switching between them lossy, and switching must never cost a resort a word
 * it wrote.
 *
 * So this file renders every one of them from the same published view and
 * insists each says the things a resort is published in order to say — its
 * name, what a room costs, and how to reach a human. What differs is left to
 * the eye; what must not differ is here.
 */
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { SITE_TEMPLATES, type PublishedResort } from "@rh/shared";
import { templateFor } from "../src/components/site/templates";

const RESORT: PublishedResort = {
  slug: "sky-eco-resort",
  name: "Sky Eco Resort",
  location: "Srimangal, Sylhet",
  address: "Lakkatura Tea Estate Road",
  contactPhone: "01700000001",
  whatsapp: "8801700000001",
  headline: "Tea gardens, ten minutes from town",
  intro: "Eight cottages on a hillside, and nothing much to do.",
  amenities: ["Wi-Fi", "Parking", "Breakfast included"],
  template: "sanctuary",
  themeColor: "#0f5132",
  map: { lat: 24.3065, lng: 91.7296 },
  social: { facebook: "https://facebook.com/skyeco", instagram: null },
  currency: "BDT",
  locale: "en-IN",
  checkInTime: "12:00 PM",
  checkOutTime: "10:00 AM",
  photos: [{ url: "/uploads/1/cover.webp", alt: "The hillside", width: 1600, height: 900 }],
  roomTypes: [
    {
      key: "deluxe",
      name: "Deluxe",
      sleeps: { adults: 2, children: 2 },
      amenities: ["Balcony"],
      photos: [{ url: "/uploads/1/deluxe.webp", alt: "The bed", width: 800, height: 600 }],
      priceFrom: 2200,
    },
    {
      key: "family-suite",
      name: "Family Suite",
      sleeps: { adults: 4, children: 2 },
      amenities: [],
      photos: [],
      priceFrom: null,
    },
  ],
};

describe("the shelf of templates", () => {
  it("has a component for every name the platform offers", () => {
    for (const t of SITE_TEMPLATES) expect(templateFor(t.key)).toBeTypeOf("function");
  });

  /**
   * A row could name a template that has since been retired. The page must
   * still draw — a resort's site going blank because somebody tidied a list is
   * not a failure mode worth having.
   */
  it("falls back rather than rendering nothing for a name it does not know", () => {
    expect(templateFor("retired-last-year")).toBe(templateFor(SITE_TEMPLATES[0]!.key));
  });
});

describe.each(SITE_TEMPLATES.map((t) => t.key))("the %s template", (key) => {
  const draw = () => {
    const Template = templateFor(key);
    return render(<Template resort={{ ...RESORT, template: key }} />);
  };

  it("says whose resort this is, and where", () => {
    draw();
    expect(screen.getAllByText(/Sky Eco Resort/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Srimangal, Sylhet/)).toBeInTheDocument();
  });

  it("says what the owner wrote", () => {
    draw();
    expect(screen.getByText(/Tea gardens, ten minutes from town/)).toBeInTheDocument();
    expect(screen.getByText(/Eight cottages on a hillside/)).toBeInTheDocument();
  });

  it("names every kind of room, with a price where there is one", () => {
    draw();
    const rooms = screen.getByTestId("rooms");
    expect(within(rooms).getByText("Deluxe")).toBeInTheDocument();
    expect(within(rooms).getByText("Family Suite")).toBeInTheDocument();
    expect(within(rooms).getByText(/2,200/)).toBeInTheDocument();
  });

  /**
   * A price nobody set is not a free room. The kind is still listed — the
   * resort has them, and a guest asking about one is a phone call — but the
   * page must ask them to ring rather than print a number nobody quoted.
   */
  it("asks a guest to ring about a room whose price nobody set", () => {
    draw();
    const rooms = screen.getByTestId("rooms");
    expect(within(rooms).getByText(/ask/i)).toBeInTheDocument();
  });

  it("gives a guest a way to reach a human", () => {
    draw();
    expect(screen.getByRole("link", { name: /01700000001/ })).toHaveAttribute(
      "href",
      "tel:01700000001",
    );
  });

  /**
   * The one number that makes the page worth visiting rather than reading. It
   * is the same component in every template, so a resort switching design
   * never loses it.
   */
  it("offers to look up what is free", () => {
    draw();
    expect(screen.getByTestId("vacancy")).toBeInTheDocument();
  });
});
