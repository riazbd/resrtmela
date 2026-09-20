"use client";

/**
 * A month at a glance: which nights are gone, and how nearly.
 *
 * The room grid answers "who is in 103 on the 14th". This answers the question
 * asked far more often — "can I take a booking for the 22nd" — which the grid
 * makes you count columns for.
 *
 * Three things it does that the pattern it was modelled on does not:
 *
 *  - **Nearly full is its own colour.** Red/green alone says "some rooms" for
 *    both one room and nine, and one room left is when a desk starts phoning
 *    people back. Amber sits between them.
 *  - **It says how many, not only that some remain**, because "4 left" is what
 *    a person answering the phone actually needs to say out loud.
 *  - **The past is dimmed rather than dropped.** A month with its first
 *    fortnight missing is hard to read as a month, and last week's occupancy
 *    is exactly what somebody reviewing the month came to see.
 */
import { isWeekend, monthGrid, monthOf } from "@/lib/calendar-month";
import { nightLoad, type NightLoadState } from "@rh/shared";

export interface DayLoad {
  /** `YYYY-MM-DD` */
  day: string;
  /** Rooms already held that night. */
  taken: number;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * How a night reads.
 *
 * *Which* state a night is in moved to `@rh/shared`'s `nightLoad` on
 * 2026-09-20 — the phone draws the same month, and two screens that
 * disagree about where amber starts give a caller two different answers.
 * What stays here is the Tailwind for each state, which React Native
 * cannot use.
 */
const LOOK: Record<NightLoadState, { box: string; num: string; note: string }> = {
  none: { box: "border-slate-200 bg-white", num: "text-slate-300", note: "text-slate-300" },
  full: { box: "border-red-200 bg-red-50", num: "text-red-700", note: "text-red-600" },
  tight: { box: "border-amber-200 bg-amber-50", num: "text-amber-800", note: "text-amber-700" },
  free: { box: "border-emerald-200 bg-emerald-50", num: "text-emerald-800", note: "text-emerald-700" },
};

export function MonthAvailability({
  month,
  sellable,
  load,
  today,
  onPick,
}: {
  /** `YYYY-MM` — the month to draw. */
  month: string;
  /** How many rooms can be sold at all, which is what "full" is measured against. */
  sellable: number;
  /** One entry per night the caller has data for; missing nights read as empty. */
  load: DayLoad[];
  /** The resort's today, so "past" means past there rather than in the browser. */
  today: string;
  onPick?: (day: string) => void;
}) {
  const taken = new Map(load.map((d) => [d.day, d.taken]));
  const weeks = monthGrid(month);

  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((name, i) => (
          <div
            key={name}
            className={`text-center text-[11px] font-semibold uppercase tracking-wide ${
              i >= 5 ? "text-amber-600" : "text-slate-400"
            }`}
          >
            {name}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {weeks.flat().map((day, i) => {
          if (!day) return <div key={`pad-${i}`} />;
          const held = taken.get(day) ?? 0;
          const load = nightLoad(held, sellable);
          const past = day < today;
          const isToday = day === today;
          const l = LOOK[load.state];
          return (
            <button
              key={day}
              onClick={() => onPick?.(day)}
              title={`${day} · ${held} of ${sellable} rooms held`}
              className={`rounded-xl border px-1 py-2 text-center transition ${l.box} ${
                // the past is dimmed, not hidden: a month missing its first
                // fortnight is hard to read as a month
                past ? "opacity-45" : "hover:brightness-95"
              } ${isToday ? "ring-2 ring-brand-500 ring-offset-1" : ""}`}
            >
              <div className={`text-lg font-bold leading-none ${l.num}`}>{Number(day.slice(8, 10))}</div>
              <div className={`mt-1 text-[11px] font-medium leading-none ${l.note}`}>{load.label}</div>
              {/* the word is wider than a 47px cell on a phone, where it spilled into
                  Saturday; the amber column header already says which days these are */}
              {isWeekend(day) && (
                <div className="mt-1 hidden text-[9px] font-semibold uppercase text-amber-600 sm:block">Weekend</div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { monthOf };
