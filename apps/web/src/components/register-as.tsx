"use client";

import Link from "next/link";

/**
 * Which kind of business is signing up.
 *
 * The platform sells to two customers — resorts and travel agencies — and had
 * a separate front door for each, joined by one line of small grey text at the
 * bottom of the resort form. So /signup was the default and the agency form
 * was something you had to find. An agency that did not find it read "Company
 * / group name" and "First resort name" and filled them in, because neither
 * label says "this form is not for you".
 *
 * It is not an extra step. The page you are on has already answered the
 * question; this shows the answer and offers the other one, so the choice is
 * visible at the moment it matters and costs a click only to the people who
 * are on the wrong form.
 */
export function RegisterAs({
  current,
  search = "",
}: {
  current: "resort" | "agency";
  /**
   * The query string to carry across, so an offer code survives the switch. An
   * invitation belongs to the person, not to the form they landed on first.
   */
  search?: string;
}) {
  const options = [
    { key: "resort" as const, label: "Resort owner", hint: "I run a resort", href: "/signup" },
    { key: "agency" as const, label: "Travel agency", hint: "I sell rooms", href: "/signup/agency" },
  ];

  return (
    <div className="mb-5">
      <div className="mb-1.5 text-xs font-medium text-slate-600">Register as</div>
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => {
          const chosen = o.key === current;
          const className = `rounded-lg px-3 py-2 text-left ring-1 transition ${
            chosen
              ? "bg-brand-600 text-white ring-brand-600"
              : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50"
          }`;
          const body = (
            <>
              <span className="block text-sm font-semibold">{o.label}</span>
              <span className={`block text-[11px] ${chosen ? "text-white/70" : "text-slate-400"}`}>
                {o.hint}
              </span>
            </>
          );
          // the form already open is stated, not offered: a link back to the
          // page you are standing on is a click that does nothing
          return chosen ? (
            <span key={o.key} aria-current="true" className={className}>
              {body}
            </span>
          ) : (
            <Link key={o.key} href={`${o.href}${search}`} className={className}>
              {body}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
