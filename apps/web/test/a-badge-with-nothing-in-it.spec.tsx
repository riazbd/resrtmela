/**
 * What a Badge does with a value that was never recorded.
 *
 * `Badge` calls `.replace` on whatever it is handed, and it is handed a field
 * from the API in twenty places. A booking's source is null whenever nobody
 * said where the booking came from — which is every booking made on the
 * booking form, because the form does not ask. Opening one of those threw
 * `Cannot read properties of null (reading 'replace')` inside Badge, the
 * console's error boundary caught it, and the whole page became "Something
 * went wrong" with no message and no request id to chase.
 *
 * The type said `string`, so the compiler had nothing to say. The type is
 * honest now, but the component is a leaf rendered from a dozen API fields and
 * should not be the thing that takes a page down when one of them is empty.
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Badge } from "@/components/ui";

describe("a badge", () => {
  it("survives a value that was never recorded", () => {
    // the crash this file exists for
    expect(() =>
      render(<Badge value={null as unknown as string} />),
    ).not.toThrow();
  });

  it("shows nothing rather than inventing a label", () => {
    // "—" or "Unknown" would be a claim; there is nothing to say
    const { container } = render(<Badge value={null as unknown as string} />);
    expect(container.textContent).toBe("");
  });

  it("is equally calm about an empty string", () => {
    const { container } = render(<Badge value="" />);
    expect(container.textContent).toBe("");
  });

  it("still labels a value it knows", () => {
    const { container } = render(<Badge value="CONFIRMED" />);
    expect(container.textContent).toBeTruthy();
  });

  it("still tidies an unknown value it was given", () => {
    const { container } = render(<Badge value="SOME_STATE" />);
    expect(container.textContent).toBe("SOME-STATE");
  });
});
