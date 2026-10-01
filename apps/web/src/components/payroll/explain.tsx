"use client";

/**
 * How payroll works, on the page, in four sentences.
 *
 * The owner, 2026-10-02: people were asking him who is on payroll, how it
 * connects to the logins, and what anybody gets — "amare manush proshno
 * korte korte mere feltese". The answers are short, so they are on the
 * screen rather than in his phone. It folds away once read, and stays folded.
 */

import { useEffect, useState } from "react";
import { CalendarRange, ChevronDown, HandCoins, KeyRound, Users } from "lucide-react";

const KEY = "rm.payroll.explained";

export function PayrollExplained({ owner }: { owner: "resort" | "agency" }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage.getItem(KEY) === "folded") setOpen(false);
  }, []);
  function toggle() {
    const next = !open;
    setOpen(next);
    window.localStorage.setItem(KEY, next ? "open" : "folded");
  }

  const points = [
    {
      icon: Users,
      title: "Who is on payroll",
      body: "Everyone you pay a monthly salary — from the day they joined until the day they left. They do not need an app login.",
      color: "#16a34a",
    },
    {
      icon: HandCoins,
      title: "What they get",
      body: "The salary for the days they were on payroll that month, plus any bonus, less any deduction.",
      color: "#7c3aed",
    },
    {
      icon: CalendarRange,
      title: "How it is paid",
      body: "Advances during the month, the rest when it is settled. Anything paid beyond a month comes off the next one.",
      color: "#2563eb",
    },
    {
      icon: KeyRound,
      title: "Logins are separate",
      body:
        owner === "resort"
          ? "A login decides who can use the app. Link it to the person on payroll to see both together. Agents earn commission, not a salary, so they are never here."
          : "A login decides who can use the app. Link your staff's logins to them here to see both together.",
      color: "#0891b2",
    },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-emerald-50/60 shadow-sm">
      <button onClick={toggle} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span className="text-sm font-semibold text-slate-800">How payroll works</span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2 xl:grid-cols-4">
          {points.map((p) => (
            <div key={p.title} className="flex gap-3 rounded-xl bg-white/80 p-3 ring-1 ring-slate-100">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `${p.color}16`, color: p.color }}>
                <p.icon className="h-4 w-4" />
              </span>
              <div>
                <div className="text-sm font-semibold text-slate-800">{p.title}</div>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{p.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
