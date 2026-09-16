/**
 * Typing into a number box that says 0.
 *
 * Every number on the console starts at 0 — adults, discount, advance — and
 * the cursor landed after it. Typing 5000 into Advance gave "05000" on the
 * screen: the state read 5000, but React leaves a number input's text alone
 * when the numbers agree, so the zero stayed where the clerk could see it and
 * wonder what had been recorded.
 *
 * Fixed once, in `Input`, because there are sixty of these boxes.
 */
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Input } from "@/components/ui";

function Advance() {
  const [n, setN] = useState(0);
  return (
    <>
      <Input aria-label="Advance" type="number" value={n} onChange={(e) => setN(Number(e.target.value))} />
      <output>{n}</output>
    </>
  );
}

describe("a number box holding 0", () => {
  it("drops the leading zero from what is typed", () => {
    render(<Advance />);
    const box = screen.getByLabelText("Advance") as HTMLInputElement;

    fireEvent.change(box, { target: { value: "05000" } });

    expect(box.value).toBe("5000");
    expect(screen.getByRole("status").textContent).toBe("5000");
  });

  it("leaves a real zero, and a decimal, alone", () => {
    render(<Advance />);
    const box = screen.getByLabelText("Advance") as HTMLInputElement;

    fireEvent.change(box, { target: { value: "0" } });
    expect(box.value).toBe("0");
    fireEvent.change(box, { target: { value: "0.5" } });
    expect(box.value).toBe("0.5");
  });

  it("selects the 0 when the box is entered, so typing replaces it", async () => {
    render(<Advance />);
    const box = screen.getByLabelText("Advance") as HTMLInputElement;

    await userEvent.click(box);
    await userEvent.keyboard("5000");

    expect(box.value).toBe("5000");
  });
});
