"use client";

import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui";

/**
 * The patterns the console kept rewriting.
 *
 * There were 14 primitives and no Tabs, Table, Drawer, DatePicker or
 * Pagination — which is exactly why the biggest pages grew to a thousand
 * lines: every screen that needed one of these built it again inline, with
 * its own spacing, its own focus behaviour and its own accessibility gaps.
 *
 * These are deliberately thin. A primitive that tries to own the content
 * inside it gets fought, and then reimplemented inline again.
 */

/** A tab strip. Identical markup lived in Settings and Platform. */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className = "",
}: {
  tabs: readonly T[];
  value: T;
  onChange: (tab: T) => void;
  className?: string;
}) {
  return (
    /**
     * Wrapping, not scrolling. `overflow-x-auto` kept the strip one row tall
     * and hid the later tabs off the right edge — on the Platform page at
     * 390px that meant *Billing policy* could not be reached at all, because
     * the sticky header sat on top of the only part of it that was visible.
     * `min-w-0` stops the strip stretching the column it lives in.
     */
    <div role="tablist" className={`flex min-w-0 flex-wrap gap-1 rounded-xl bg-slate-100 p-1 ${className}`}>
      {tabs.map((t) => (
        <button
          key={t}
          role="tab"
          aria-selected={value === t}
          onClick={() => onChange(t)}
          className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition ${
            value === t ? "bg-white text-brand-700 shadow" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

/**
 * A table on a laptop; a list of cards on a phone.
 *
 * This used to scroll inside itself, which kept the whole page from moving
 * sideways but left the content reachable only by dragging. Measured at 390px
 * on 2026-09-13, Platform → Resorts came to 1009px in a 390px screen, with
 * seven cells rendering below 13px. Scrolling was never the fix — a table is
 * simply the wrong shape for a phone, and the right one is a card per row.
 *
 * The labels come from the table's own `<thead>`, written onto each cell as
 * `data-label` for `globals.css` to print. Doing it here rather than in the
 * pages means no page has to label its cells: the twenty-four files that draw
 * tables keep the markup they already have.
 *
 * Why the DOM and not the React children: cells are produced by `.map()` over
 * data, wrapped in `<Td>`, and spread across fragments and conditionals.
 * Guessing a cell's column by walking rendered children is guesswork;
 * `cellIndex` is the browser's own answer.
 */
export function Table({
  children,
  minWidth = 640,
  className = "",
  /** Classes for the `<table>` itself — `table-fixed`, `text-sm`, and the like. */
  tableClassName = "",
}: {
  children: React.ReactNode;
  minWidth?: number;
  className?: string;
  tableClassName?: string;
}) {
  const host = useRef<HTMLTableElement>(null);

  // no dependency list: rows change whenever the page re-renders, and
  // re-reading a handful of cells is cheaper than tracking what changed
  useEffect(() => {
    const table = host.current;
    if (!table) return;
    const labels = [...table.querySelectorAll<HTMLTableCellElement>("thead th")].map((th) =>
      (th.textContent ?? "").trim(),
    );
    for (const cell of table.querySelectorAll<HTMLTableCellElement>("tbody td")) {
      const label = labels[cell.cellIndex];
      // an empty header means a column of buttons; a card showing a blank
      // label above them reads as a value that failed to load
      if (label) cell.setAttribute("data-label", label);
      else cell.removeAttribute("data-label");
    }
  });

  return (
    <div className={`rm-table-wrap ${className}`}>
      <table
        ref={host}
        className={`rm-table w-full ${tableClassName}`.trim()}
        style={{ "--rm-min": `${minWidth}px` } as React.CSSProperties}
      >
        {children}
      </table>
    </div>
  );
}

/** Day-at-a-time navigation: ← · Today · → · a date field. */
export function DateNav({
  value,
  onChange,
  todayLabel = "Today",
  className = "",
}: {
  value: string;
  onChange: (iso: string) => void;
  todayLabel?: string;
  className?: string;
}) {
  const shift = (days: number) => {
    // stepped in UTC: adding 24 hours in local time lands on the same day
    // twice a year, and a front desk cannot be told the calendar skipped
    const d = new Date(`${value}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    onChange(d.toISOString().slice(0, 10));
  };
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Button variant="ghost" size="sm" onClick={() => shift(-1)} aria-label="Previous day">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="sm" onClick={() => onChange(new Date().toISOString().slice(0, 10))}>
        {todayLabel}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => shift(1)} aria-label="Next day">
        <ChevronRight className="h-4 w-4" />
      </Button>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
    </div>
  );
}

/**
 * Paging, with the honest count.
 *
 * The API returns the true total with every page, so this says "showing 100
 * of 431" rather than implying 100 is all there is — which is the failure the
 * page envelope was introduced to end.
 */
export function Pagination({
  skip,
  take,
  total,
  onChange,
}: {
  skip: number;
  take: number;
  total: number;
  onChange: (skip: number) => void;
}) {
  if (total <= take) return null;
  const from = skip + 1;
  const to = Math.min(skip + take, total);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
      <span>
        Showing {from}–{to} of {total}
      </span>
      <span className="flex gap-2">
        <Button variant="ghost" size="sm" disabled={skip === 0} onClick={() => onChange(Math.max(0, skip - take))}>
          Previous
        </Button>
        <Button variant="ghost" size="sm" disabled={to >= total} onClick={() => onChange(skip + take)}>
          Next
        </Button>
      </span>
    </div>
  );
}

/**
 * A side panel. Escape closes it and focus moves into it, which the inline
 * versions did not do — a keyboard user could tab straight past an open panel
 * into the page behind it.
 */
export function Drawer({
  open,
  onClose,
  title,
  children,
  width = "max-w-xl",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  width?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={`relative flex h-full w-full ${width} flex-col overflow-y-auto bg-white shadow-xl outline-none`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
