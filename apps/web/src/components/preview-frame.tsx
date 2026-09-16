"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, getToken } from "@/lib/api";

/**
 * A page, drawn for its owner before it is published (2026-09-17).
 *
 * The public address answers 404 until the page is published — to everybody,
 * the owner included — so the editor's "see it" link comes here instead: the
 * same drawing, fetched with the owner's own session. A strip across the top
 * says it is a preview, so nobody shares this address thinking it is the site.
 */
export function PreviewFrame<T>({
  path,
  back,
  render,
}: {
  path: string;
  back: string;
  render: (data: T) => React.ReactNode;
}) {
  const [data, setData] = useState<T | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    // signed out, the API's own words ("Missing bearer token") are not for a person
    if (!getToken()) {
      setProblem("Sign in to see a preview of your page.");
      return;
    }
    api<T>(path)
      .then(setData)
      .catch((e: Error) => setProblem(e.message || "This preview could not be loaded."));
  }, [path]);

  return (
    <>
      <div className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-400 px-4 py-2 text-center text-xs font-semibold text-amber-950">
        <span>Preview — only you can see this. The free-room check works once the page is published.</span>
        <Link href={back} className="rounded-full bg-amber-950 px-3 py-1 text-[11px] font-bold text-amber-100 hover:bg-amber-900">
          Back to the editor
        </Link>
      </div>
      {problem ? (
        <div className="mx-auto max-w-lg px-6 py-20 text-center text-sm text-slate-600">
          {problem}
          <div className="mt-4">
            <Link href="/login" className="font-semibold text-slate-900 underline">Sign in</Link>
          </div>
        </div>
      ) : data ? (
        render(data)
      ) : (
        <div className="px-6 py-20 text-center text-sm text-slate-400">Drawing your page…</div>
      )}
    </>
  );
}
