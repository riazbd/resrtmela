"use client";

import { useT, isStateKey, type DictKey } from "@/lib/i18n";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { EmptyArt } from "@/components/art";

// ── primitives ──

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  loading,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "subtle";
  size?: "sm" | "md";
  loading?: boolean;
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100";
  const variants = {
    primary:
      "bg-gradient-to-b from-emerald-500 to-brand-600 text-white shadow-sm shadow-brand-600/30 ring-1 ring-inset ring-white/10 hover:from-emerald-600 hover:to-brand-700 hover:shadow-md hover:shadow-brand-600/30",
    ghost: "border border-slate-200 bg-white text-slate-700 shadow-sm shadow-slate-900/5 hover:border-slate-300 hover:bg-slate-50",
    danger: "bg-gradient-to-b from-red-500 to-red-600 text-white shadow-sm shadow-red-600/30 hover:from-red-600 hover:to-red-700",
    subtle: "bg-slate-100 text-slate-700 hover:bg-slate-200",
  };
  const sizes = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2 text-sm" };
  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && (
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
      )}
      {children}
    </button>
  );
}

/**
 * A text box — and, for `type="number"`, one that a 0 does not get in the way of.
 *
 * Every number on the console starts at 0 and the cursor landed after it, so
 * typing 5000 into Advance showed "05000": the state was 5000, and React
 * leaves a number input's text alone when the numbers agree. Entering the box
 * selects what is in it, so typing replaces the 0, and a leading zero typed
 * anyway is dropped before anyone reads the value. Here once, because there
 * are sixty of these boxes.
 */
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const numeric = props.type === "number";
  return (
    <input
      {...props}
      {...(numeric
        ? {
            onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
              // at once, not a frame later: a frame later swallowed whatever
              // was typed in between
              try { e.currentTarget.select(); } catch { /* not every browser selects a number box */ }
              e.currentTarget.dataset.justFocused = "1";
              props.onFocus?.(e);
            },
            onMouseUp: (e: React.MouseEvent<HTMLInputElement>) => {
              // the mouse-up of the click that focused the box would put the
              // cursor back after the 0; only that one is cancelled
              if (e.currentTarget.dataset.justFocused) {
                delete e.currentTarget.dataset.justFocused;
                e.preventDefault();
              }
              props.onMouseUp?.(e);
            },
            onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
              delete e.currentTarget.dataset.justFocused;
              props.onKeyDown?.(e);
            },
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
              const box = e.currentTarget;
              const clean = box.value.replace(/^(-?)0+(?=\d)/, "$1");
              if (clean !== box.value) box.value = clean;
              props.onChange?.(e);
            },
          }
        : {})}
      className={`w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm shadow-slate-900/[0.03] outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-100 ${props.className ?? ""}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm shadow-slate-900/[0.03] outline-none transition hover:border-slate-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-100 ${props.className ?? ""}`}
    />
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rm-card rounded-2xl border border-slate-200/70 bg-white ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-slate-100/80 px-5 py-3.5">
          <h3 className="flex items-center gap-2 text-[15px] font-bold tracking-tight text-slate-800">
            <span aria-hidden className="h-4 w-1 rounded-full bg-gradient-to-b from-emerald-400 to-teal-600" />
            {title}
          </h3>
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "green" | "red" | "amber";
}) {
  /**
   * Each tone is a colour that means something — green money in, red money
   * due, amber waiting — carried by the figure, a soft wash in the corner
   * and the rule along the top, so a row of tiles reads at a glance.
   */
  const tones = {
    default: { text: "text-slate-900", wash: "from-slate-400/15", rule: "from-slate-300 to-slate-400" },
    green: { text: "text-emerald-700", wash: "from-emerald-400/25", rule: "from-emerald-400 to-teal-500" },
    red: { text: "text-rose-700", wash: "from-rose-400/20", rule: "from-rose-400 to-red-500" },
    amber: { text: "text-amber-700", wash: "from-amber-400/25", rule: "from-amber-300 to-orange-500" },
  };
  const t = tones[tone];
  return (
    <div className="rm-card relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white p-4">
      <div aria-hidden className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${t.rule}`} />
      <div aria-hidden className={`pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-gradient-to-br ${t.wash} to-transparent`} />
      <div className="relative text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`relative mt-1.5 text-2xl font-extrabold tracking-tight tabular-nums ${t.text}`}>{value}</div>
      {sub && <div className="relative mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

const STATE_STYLES: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700 ring-amber-200",
  CONFIRMED: "bg-green-50 text-green-700 ring-green-200",
  CHECKED_IN: "bg-blue-50 text-blue-700 ring-blue-200",
  CHECKED_OUT: "bg-slate-100 text-slate-600 ring-slate-200",
  CANCELLED: "bg-red-50 text-red-700 ring-red-200",
  NO_SHOW: "bg-yellow-900/10 text-yellow-900 ring-yellow-900/20",
  UNPAID: "bg-red-50 text-red-700 ring-red-200",
  PARTIAL: "bg-orange-50 text-orange-700 ring-orange-200",
  PAID: "bg-green-50 text-green-700 ring-green-200",

  /**
   * A room is not a booking.
   *
   * The rooms screen borrowed CONFIRMED and CANCELLED because they happened to
   * be green and red, so a sellable room said "Confirmed" — a word about a
   * reservation — and a room out for a repair said "Cancelled", which reads as
   * though it had been removed. Amber rather than red for the same reason: it
   * is off sale today, not gone.
   */
  ACTIVE: "bg-green-50 text-green-700 ring-green-200",
  OUT_OF_SERVICE: "bg-amber-50 text-amber-700 ring-amber-200",
};

/**
 * A booking's state, in the reader's language.
 *
 * This is the single most-read word on the busiest screens, and it was the
 * raw enum with its underscore swapped for a hyphen — CHECKED-IN — on a
 * console that calls itself Bangla-first.
 */
export function Badge({ value }: { value: string | null | undefined }) {
  const t = useT();
  /**
   * Nothing to label is nothing to draw.
   *
   * This took `string` and called `.replace` on it, and it is rendered from a
   * dozen API fields across twenty screens — several of which are nullable and
   * one of which (a booking's source) is null for every booking made on the
   * form, because the form does not ask. The result was not a missing badge:
   * the throw reached the console's error boundary and replaced the entire
   * page with "Something went wrong".
   *
   * A placeholder would be worse than nothing. "—" or "Unknown" is a claim
   * about the data, and the claim here is that nobody recorded anything.
   */
  if (value == null || value === "") return null;
  const style = STATE_STYLES[value] ?? "bg-slate-100 text-slate-600 ring-slate-200";
  const key = `st.${value}` as DictKey;
  const label = isStateKey(key) ? t(key) : value.replace(/_/g, "-");
  return (
    <span className={`inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${style}`}>
      {label}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  wide,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  /**
   * Every form in this console is one of these — new booking, edit,
   * arrival, departure, new activity, add user, food package — so what
   * is missing here is missing seven times over.
   *
   * It had no role, so opening one told an assistive technology that
   * nothing had changed; no name, so there was nothing to announce; and
   * no focus move, so the next Tab walked the page the dialog was
   * covering. Found by pointing a browser tool at `[role=dialog]` and
   * getting nothing back — what a tool cannot find, a screen reader
   * cannot announce either.
   */
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) box.current?.focus();
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-10 backdrop-blur-[2px]">
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // focusable so the dialog itself can hold focus on open; -1 keeps
        // it out of the Tab order, where it is not a stop of its own
        tabIndex={-1}
        className={`rm-pop w-full ${wide ? "max-w-3xl" : "max-w-lg"} overflow-hidden rounded-2xl bg-white shadow-2xl shadow-slate-900/20 ring-1 ring-slate-900/5 outline-none`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-emerald-50/80 via-white to-white px-5 py-3.5">
          <h3 id={titleId} className="text-[15px] font-bold tracking-tight text-slate-800">
            {title}
          </h3>
          <button
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="rounded p-1 text-slate-400 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

// ── toasts ──

interface Toast {
  id: number;
  msg: string;
  kind: "ok" | "err";
}
const ToastCtx = createContext<{ push: (msg: string, kind?: "ok" | "err") => void } | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const push = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] space-y-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded-lg px-4 py-2.5 text-sm text-white shadow-lg ${
              t.kind === "err" ? "bg-red-600" : "bg-brand-700"
            }`}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  return ctx ?? { push: () => {} };
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-brand-600" />
      {label ?? "Loading…"}
    </div>
  );
}

/** Nothing to show: a small picture and the sentence, never a blank box. */
export function Empty({ msg }: { msg: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <EmptyArt />
      <div className="max-w-sm text-sm font-medium text-slate-500">{msg}</div>
    </div>
  );
}

export function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`bg-slate-50/70 px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500 ${className}`}>
      {children}
    </th>
  );
}

export function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 text-sm text-slate-700 ${className}`}>{children}</td>;
}
