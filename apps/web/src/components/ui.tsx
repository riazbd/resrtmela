"use client";

import { useT, isStateKey, type DictKey } from "@/lib/i18n";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

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
    "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-brand-600 text-white hover:bg-brand-700",
    ghost: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
    danger: "bg-red-600 text-white hover:bg-red-700",
    subtle: "bg-slate-100 text-slate-700 hover:bg-slate-200",
  };
  const sizes = { sm: "px-2.5 py-1.5 text-xs", md: "px-3.5 py-2 text-sm" };
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

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 ${props.className ?? ""}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 ${props.className ?? ""}`}
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
      <span className="text-xs font-medium text-slate-600">{label}</span>
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
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
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
  const tones = {
    default: "text-slate-900",
    green: "text-green-700",
    red: "text-red-700",
    amber: "text-amber-700",
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold tracking-tight ${tones[tone]}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-10">
      <div className={`w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-xl bg-white shadow-xl`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100">
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

export function Empty({ msg }: { msg: string }) {
  return <div className="py-10 text-center text-sm text-slate-400">{msg}</div>;
}

export function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400 ${className}`}>
      {children}
    </th>
  );
}

export function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 text-sm text-slate-700 ${className}`}>{children}</td>;
}
