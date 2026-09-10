/**
 * A room is not a booking, and its badge should not say so.
 *
 * The rooms screen rendered `<Badge value={r.status === "ACTIVE" ?
 * "CONFIRMED" : "CANCELLED"} />` — the booking-state badge, borrowed for a room
 * because it happened to be green and red. So a sellable room said "Confirmed",
 * which is a word about a reservation, and a room out of service said
 * "Cancelled", which reads like it has been removed rather than taken off sale
 * for a repair. The activities screen borrowed the same two words for an active
 * catalogue entry.
 *
 * The badge already takes any value and falls back to neutral grey, so the fix
 * is a vocabulary rather than a component: the room's own two states, coloured
 * and translated like everything else on the screen.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LangProvider } from "@/lib/i18n";
import { Badge } from "@/components/ui";

const show = (value: string, lang?: "en" | "bn") => {
  if (lang) window.localStorage.setItem("rh.lang", lang);
  else window.localStorage.removeItem("rh.lang");
  return render(
    <LangProvider>
      <Badge value={value} />
    </LangProvider>,
  );
};

describe("a room's badge", () => {
  it("says the room is on sale, not that something was confirmed", () => {
    show("ACTIVE");

    expect(screen.getByText("On sale")).toBeTruthy();
  });

  it("says the room is out of service, not that it was cancelled", () => {
    show("OUT_OF_SERVICE");

    expect(screen.getByText("Out of service")).toBeTruthy();
  });

  it("has the words in Bangla too, like every other badge", () => {
    show("OUT_OF_SERVICE", "bn");

    expect(screen.getByText("সেবার বাইরে")).toBeTruthy();
  });

  it("is coloured, rather than falling through to the grey default", () => {
    const { container } = show("ACTIVE");

    expect(container.querySelector("span")?.className).toContain("green");
  });

  it("marks out of service as a warning, not as a failure", () => {
    const { container } = show("OUT_OF_SERVICE");

    const cls = container.querySelector("span")?.className ?? "";
    expect(cls).toContain("amber");
    expect(cls).not.toContain("red");
  });
});

describe("a booking's badge", () => {
  it("still says what it always said", () => {
    show("CONFIRMED");

    expect(screen.getByText("Confirmed")).toBeTruthy();
  });
});
