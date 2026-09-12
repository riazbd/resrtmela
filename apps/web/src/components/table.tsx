"use client";

/**
 * A table that becomes a list of cards when the screen is narrow.
 *
 * Every table in this console was written the same way — `overflow-x-auto`
 * around a `<table className="w-full min-w-[860px]">` — which keeps the columns
 * and asks the reader to drag. On a phone that is the wrong shape: measured on
 * 2026-09-13, one of these came to 1009px inside a 390px screen, with seven
 * cells rendering below 13px.
 *
 * The conversion has to be cheap or it will not happen across twenty-four
 * files, so this component takes the markup the pages already have. It reads
 * the column names out of the `<thead>` it was given and writes each one onto
 * the cells beneath it as `data-label`; the stylesheet then stacks the rows and
 * prints those labels. No page has to label its own cells, and a page that has
 * not been converted yet is unaffected.
 *
 * Why the DOM and not React children: cells are built by `.map()` over data,
 * wrapped in `<Td>`, sometimes spread across fragments and conditionals.
 * Walking rendered children to guess which column each belongs to is guesswork;
 * reading `cellIndex` after the fact is the browser's own answer.
 */
import { useEffect, useRef, type ReactNode } from "react";

export function Table({
  children,
  className = "",
  /** Rows are re-labelled whenever this changes — pass the data the table draws. */
  rows,
}: {
  children: ReactNode;
  className?: string;
  rows?: unknown;
}) {
  const host = useRef<HTMLTableElement>(null);

  useEffect(() => {
    const table = host.current;
    if (!table) return;

    const labels = [...table.querySelectorAll<HTMLTableCellElement>("thead th")].map((th) =>
      (th.textContent ?? "").trim(),
    );

    for (const cell of table.querySelectorAll<HTMLTableCellElement>("tbody td")) {
      const label = labels[cell.cellIndex];
      // an empty header means a column of buttons: a card showing a blank
      // label above them reads as a missing value, so leave it bare
      if (label) cell.setAttribute("data-label", label);
      else cell.removeAttribute("data-label");
    }
  });

  return (
    <div className="rm-table-wrap">
      <table ref={host} className={`rm-table ${className}`}>
        {children}
      </table>
    </div>
  );
}
