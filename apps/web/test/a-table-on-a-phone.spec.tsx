/**
 * A table is the wrong shape for a 390px screen.
 *
 * The console's answer until now was `overflow-x-auto` plus an explicit
 * `min-w-[860px]`, which is a decision, not an oversight: it says "keep the
 * columns, make the human drag". Measured on production on 2026-09-13, the
 * Platform → Resorts table came to 1009px inside a 390px screen.
 *
 * The other shape is one card per row, each cell carrying its own column name.
 * Doing that by hand would mean labelling every cell in twenty-four files, so
 * `Table` reads the labels out of its own `<thead>` and writes them onto the
 * cells — the markup on each page stays exactly as it is, and the pages that
 * have not been converted yet keep working unchanged.
 *
 * These tests are about the labelling, because that is the part with logic.
 * Whether the cards *look* right is decided by opening a phone-sized browser,
 * which no jsdom test can stand in for.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Table } from "../src/components/patterns";

function Sheet() {
  return (
    <Table>
      <thead>
        <tr>
          <th>Room</th>
          <th>Guest</th>
          <th>Due</th>
          <th />
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Hilltop 2</td>
          <td>Rahim Uddin</td>
          <td>৳4,500</td>
          <td>
            <button>Open</button>
          </td>
        </tr>
        <tr>
          <td>Hilltop 3</td>
          <td>Karim Mia</td>
          <td>৳0</td>
          <td>
            <button>Open</button>
          </td>
        </tr>
      </tbody>
    </Table>
  );
}

describe("a table on a phone", () => {
  it("gives every cell the name of its column", () => {
    render(<Sheet />);
    const first = screen.getByText("Rahim Uddin");
    expect(first.getAttribute("data-label")).toBe("Guest");
    const due = screen.getByText("৳4,500");
    expect(due.getAttribute("data-label")).toBe("Due");
  });

  it("labels every row, not just the first", () => {
    render(<Sheet />);
    expect(screen.getByText("Karim Mia").getAttribute("data-label")).toBe("Guest");
  });

  it("leaves an unnamed column unlabelled rather than inventing a name", () => {
    // the last column is the row's actions; a card that says "" above a button
    // is worse than a card that just shows the button
    render(<Sheet />);
    const actions = screen.getAllByRole("button")[0].closest("td");
    expect(actions?.getAttribute("data-label")).toBe(null);
  });

  it("does not force a width that a phone cannot hold", () => {
    /**
     * The whole complaint in one assertion. A minimum width may not reach the
     * element as a class, because Tailwind would then apply it at every size,
     * including the 390px screen the front desk is holding.
     */
    const { container } = render(<Sheet />);
    const table = container.querySelector("table")!;
    expect(table.className).not.toMatch(/min-w-\[/);
    expect(table.style.minWidth).toBe("");
  });

  it("hands the page's minimum width back for wide screens only", () => {
    // it returns as a custom property, which globals.css reads inside
    // `@media (min-width: 640px)` and nowhere else
    const { container } = render(
      <Table minWidth={720}>
        <thead>
          <tr>
            <th>Room</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Hilltop 2</td>
          </tr>
        </tbody>
      </Table>,
    );
    expect(container.querySelector("table")!.style.getPropertyValue("--rm-min")).toBe("720px");
  });
});
