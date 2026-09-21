"use client";

/**
 * Where the owner writes what a plan costs.
 *
 * Until today this screen had two number boxes — "Monthly fee" and "Yearly
 * fee" — and those two boxes were the entire vocabulary the platform had for
 * pricing. Selling a quarter, a three-year deal, a free first week, or six
 * months at half price was not something anybody could do here; it was a
 * migration and a deploy.
 *
 * A plan carries shelves, and a shelf carries rungs. "Free for 2 weeks, then
 * ৳1,250 a month for 3 months, then ৳2,500 a month" is three rungs on one
 * shelf, typed in. Nothing about it is special-cased anywhere: the billing
 * sweep walks whatever is written here.
 *
 * The one rule the editor enforces in front of the owner rather than after
 * they press save is that the last rung runs forever. A ladder that stops
 * leaves a plan whose next period has no price, and the API refuses it — but
 * being told why while you are still typing is better than being told after.
 */

import { useEffect, useState } from "react";
import { client, money, cur } from "@/lib/api";
import { Button as Btn, useToast } from "@/components/ui";
import {
  PERIOD_UNITS,
  phasesAreSane,
  scheduleSentence,
  type Phase,
  type PeriodUnit,
} from "@rh/shared";
import { Plus, Trash2 } from "lucide-react";

interface Rung {
  count: number;
  unit: PeriodUnit;
  price: number;
  /** null is the last rung: forever. */
  repeats: number | null;
}

interface Shelf {
  label: string;
  active: boolean;
  phases: Rung[];
}

const asPhases = (rungs: Rung[]): Phase[] => rungs.map((r, i) => ({ seq: i + 1, ...r }));

/** A sensible rung to add: the same shape as the one above it. */
const nextRung = (after: Rung | undefined): Rung => ({
  count: after?.count ?? 1,
  unit: after?.unit ?? "MONTH",
  price: after?.price ?? 0,
  repeats: null,
});

export function PlanLadder({ plan, label }: { plan: string; label: string }) {
  const { push } = useToast();
  const [shelves, setShelves] = useState<Shelf[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    client.platform.planSchedules(plan)
      .then((rows) => {
        if (!alive) return;
        setShelves(
          rows.map((r) => ({
            label: r.label,
            active: r.active ?? true,
            phases: r.phases.map((p) => ({ ...p, repeats: p.repeats ?? null })),
          })),
        );
      })
      .catch((e) => alive && setErr(String((e as Error).message ?? e)));
    return () => {
      alive = false;
    };
  }, [plan]);

  if (err && !shelves) return <p className="text-xs text-red-700">{err}</p>;
  if (!shelves) return <p className="text-xs text-slate-400">Loading prices…</p>;

  const edit = (i: number, patch: Partial<Shelf>) =>
    setShelves(shelves.map((s, n) => (n === i ? { ...s, ...patch } : s)));
  const editRung = (i: number, j: number, patch: Partial<Rung>) =>
    edit(i, { phases: shelves[i]!.phases.map((p, n) => (n === j ? { ...p, ...patch } : p)) });

  /**
   * What is wrong with each shelf, checked here as well as on the server.
   *
   * `phasesAreSane` is the same function the API calls and the same one the
   * billing sweep's guarantees rest on — imported, not reimplemented, because
   * a form that disagrees with the server about what is valid teaches people
   * to distrust both.
   */
  const problems = shelves.map((s) =>
    !s.label.trim() ? "Every way of buying needs a name" : phasesAreSane(asPhases(s.phases)),
  );
  const dupe = (() => {
    const seen = shelves.map((s) => s.label.trim().toLowerCase());
    return seen.some((l, i) => l && seen.indexOf(l) !== i);
  })();
  const blocked = shelves.length === 0 || dupe || problems.some(Boolean);

  // an arrow, not a declaration: `shelves` is narrowed to non-null above,
  // and a hoisted function would be typed against the wider state
  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      const saved = await client.platform.setPlanSchedules(plan, shelves);
      setShelves(
        saved.map((r) => ({
          label: r.label,
          active: r.active ?? true,
          phases: r.phases.map((p) => ({ ...p, repeats: p.repeats ?? null })),
        })),
      );
      push(`Prices saved for ${label}`);
    } catch (e) {
      // the API refuses a shelf people are still being billed on, and names it
      setErr(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {shelves.map((shelf, i) => (
        <div key={i} className="rounded-xl border border-slate-200 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={shelf.label}
              onChange={(e) => edit(i, { label: e.target.value })}
              placeholder="Monthly"
              className="w-40 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-semibold"
            />
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-500">
              <input
                type="checkbox"
                checked={shelf.active}
                onChange={(e) => edit(i, { active: e.target.checked })}
                className="h-3.5 w-3.5 accent-brand-600"
              />
              On sale
            </label>
            <button
              onClick={() => setShelves(shelves.filter((_, n) => n !== i))}
              className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
              title="Remove this way of buying"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          {/**
           * Two fields to a row, not four across.
           *
           * These cards sit in a grid and are narrow; a single flex row put
           * each field on its own line and a three-step ladder filled the
           * screen. The rung is its own little block instead, which also gives
           * the step number somewhere to live — and "step 2 of this ladder" is
           * the thing somebody editing needs to keep straight.
           */}
          <div className="mt-2 space-y-2">
            {shelf.phases.map((rung, j) => {
              const last = j === shelf.phases.length - 1;
              return (
                <div key={j} className="rounded-lg bg-white p-2 ring-1 ring-slate-200">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      Step {j + 1}
                      {last && shelf.phases.length > 1 ? " · settles here" : ""}
                    </span>
                    {shelf.phases.length > 1 && (
                      <button
                        onClick={() =>
                          edit(i, {
                            phases: shelf.phases
                              .filter((_, n) => n !== j)
                              // whatever ends up last runs forever
                              .map((ph, n, all) => (n === all.length - 1 ? { ...ph, repeats: null } : ph)),
                          })
                        }
                        className="rounded p-0.5 text-slate-300 hover:bg-red-50 hover:text-red-600"
                        title="Remove this step"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <label className="block">
                      <span className="text-[10px] font-semibold text-slate-400">Every</span>
                      <input
                        type="number"
                        min={1}
                        value={String(rung.count)}
                        onChange={(e) => editRung(i, j, { count: Number(e.target.value) })}
                        className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-semibold text-slate-400">Unit</span>
                      <select
                        value={rung.unit}
                        onChange={(e) => editRung(i, j, { unit: e.target.value as PeriodUnit })}
                        className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
                      >
                        {PERIOD_UNITS.map((u) => (
                          <option key={u} value={u}>
                            {u.toLowerCase()}
                            {rung.count === 1 ? "" : "s"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-semibold text-slate-400">Price ({cur()})</span>
                      <input
                        type="number"
                        min={0}
                        value={String(rung.price)}
                        onChange={(e) => editRung(i, j, { price: Number(e.target.value) })}
                        className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-semibold text-slate-400">
                        {last ? "Lasts" : "How many"}
                      </span>
                      {last ? (
                        // the last rung is the price the customer settles on and
                        // has no end — saying so beats a disabled box
                        <div className="mt-0.5 w-full rounded-lg bg-slate-100 px-2 py-1 text-sm text-slate-500">
                          forever
                        </div>
                      ) : (
                        <input
                          type="number"
                          min={1}
                          value={String(rung.repeats ?? 1)}
                          onChange={(e) => editRung(i, j, { repeats: Math.max(1, Number(e.target.value)) })}
                          className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
                        />
                      )}
                    </label>
                  </div>
                </div>
              );
            })}
            <button
              onClick={() =>
                edit(i, {
                  phases: [
                    // the rung that was last gets a length, because it is not
                    // last any more
                    ...shelf.phases.map((p, n, all) =>
                      n === all.length - 1 ? { ...p, repeats: p.repeats ?? 1 } : p,
                    ),
                    nextRung(shelf.phases[shelf.phases.length - 1]),
                  ],
                })
              }
              className="text-[11px] font-semibold text-brand-700 hover:underline"
            >
              + Add a step
            </button>
          </div>

          {/**
           * The sentence a customer will read, printed while it is being
           * typed. It is `scheduleSentence` — the same function the pricing
           * page, the signup summary and the owner's billing screen call — so
           * what is written here is literally what gets shown.
           */}
          <div className="mt-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600">
            {problems[i] ? (
              <span className="text-red-700">{problems[i]}</span>
            ) : (
              <>
                Customers see: <b>{scheduleSentence(asPhases(shelf.phases), money)}</b>
              </>
            )}
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() =>
            setShelves([
              ...shelves,
              { label: "", active: true, phases: [{ count: 1, unit: "MONTH", price: 0, repeats: null }] },
            ])
          }
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          <Plus className="h-3.5 w-3.5" /> Another way to buy
        </button>
        <Btn size="sm" loading={busy} disabled={blocked} onClick={save} className="ml-auto">
          Save prices
        </Btn>
      </div>

      {dupe && <p className="text-xs text-red-700">Two ways of buying cannot share a name.</p>}
      {shelves.length === 0 && (
        <p className="text-xs text-red-700">
          A plan needs at least one way to buy it, or nobody can be put on it.
        </p>
      )}
      {err && <p className="rounded-lg bg-red-50 px-2.5 py-2 text-xs text-red-700">{err}</p>}
    </div>
  );
}
