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

/**
 * A grid is not a list, and the card rule ruins it.
 *
 * Every table below 640px becomes one card per row, each cell a labelled line.
 * That is right for a list of records — a booking, a payment, a guest — where
 * a row is one thing and a cell is one of its fields.
 *
 * A calendar is the other kind of table. Its row is a room, its cells are the
 * nights of a month, and a cell means nothing without the column it sits under.
 * Turned into cards, room 101 became thirty stacked lines reading "T15", "W16",
 * "T17" — one screen per room per week, and no way to see a stay at all.
 * Measured on a 390px screen on 2026-09-15.
 *
 * So a grid says so, and keeps being a grid. It scrolls sideways on a phone,
 * which is the honest answer for a matrix: there is no shape that fits a month
 * of nights into 390px, and pretending otherwise produced something far worse
 * than dragging.
 */
describe("a grid on a phone", () => {
  it("says it is a grid, so the card rule lets it alone", () => {
    const { container } = render(
      <Table grid minWidth={860}>
        <thead>
          <tr>
            <th>Room</th>
            <th>15</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>101</td>
            <td />
          </tr>
        </tbody>
      </Table>,
    );
    expect(container.querySelector("table")!.className).toMatch(/\brm-grid\b/);
  });

  it("keeps its minimum width on a phone, because sideways is the point", () => {
    const { container } = render(
      <Table grid minWidth={860}>
        <thead>
          <tr>
            <th>Room</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>101</td>
          </tr>
        </tbody>
      </Table>,
    );
    // the wrapper is what scrolls; the table is what overflows it
    expect(container.querySelector("table")!.style.getPropertyValue("--rm-grid-min")).toBe("860px");
  });

  it("is still a list by default — one opt-out, deliberately taken", () => {
    render(<Sheet />);
    expect(screen.getByText("Rahim Uddin").closest("table")!.className).not.toMatch(/\brm-grid\b/);
  });

  /**
   * A grid's cells carry no labels. The label is the column header, which stays
   * on screen; writing "T15" into a `data-label` would only make the card rule
   * look deliberate if it ever reached one.
   */
  it("does not label its cells", () => {
    const { container } = render(
      <Table grid minWidth={860}>
        <thead>
          <tr>
            <th>Room</th>
            <th>15</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>101</td>
            <td>free</td>
          </tr>
        </tbody>
      </Table>,
    );
    expect(container.querySelector("tbody td")!.getAttribute("data-label")).toBe(null);
  });
});
