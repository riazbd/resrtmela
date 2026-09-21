/**
 * Where the app is downloaded (2026-09-21).
 *
 * Resort Mela is not on Play or the App Store, so this page is the
 * store. It has to do three things a store does for you: say what the
 * current version is, hand over the file, and explain the one step
 * Android puts in the way of a file that did not come from Play.
 *
 * Rendered on the server so the version is in the HTML. A staff member
 * sent here by a phone that has just refused to open is on a bad
 * connection by definition, and a page whose only useful content
 * arrives with JavaScript is a page that says nothing to them.
 *
 * The numbers come from the API's `/app/release` — the same four the
 * floor is made of — so the page cannot advertise a version the server
 * does not think is current.
 */
import type { Metadata } from "next";
import { API_URL } from "@/lib/api-url";
import { fetchBrand } from "@/lib/brand";
import type { AppRelease } from "@rh/shared";

export const metadata: Metadata = {
  title: "Download the app",
  description: "Resort Mela for Android — the front desk in your pocket.",
};

/**
 * What is on offer. Never throws: this page is the one a locked-out
 * phone is sent to, so it renders with or without the API.
 */
async function currentRelease(): Promise<AppRelease | null> {
  try {
    const r = await fetch(`${API_URL}/app/release`, { next: { revalidate: 30 } } as RequestInit);
    if (!r.ok) return null;
    return (await r.json()) as AppRelease;
  } catch {
    return null;
  }
}

const STEPS = [
  {
    head: "Download the file",
    body: "Press the button above. Your browser may ask whether to keep a file of this kind — say yes; it is an app, not a document.",
  },
  {
    head: "Allow this one install",
    body: "Android asks before installing anything that did not come from Play. When it offers Settings, turn on “Allow from this source” for your browser, then come back and press the file again.",
  },
  {
    head: "Open it",
    body: "Installing over an older Resort Mela keeps everything — you stay signed in and nothing saved on the phone is lost.",
  },
];

export default async function DownloadPage() {
  const [brand, release] = await Promise.all([fetchBrand(), currentRelease()]);

  return (
    <div className="mx-auto max-w-2xl px-5 py-12 sm:py-16">
      <a href="/" className="text-sm font-semibold text-brand-700 hover:underline">
        ← {brand.name}
      </a>

      <h1 className="mt-6 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
        Resort Mela for Android
      </h1>
      <p className="mt-3 text-base text-slate-600">
        The front desk in your pocket — today&rsquo;s arrivals, taking a booking, taking money, and
        what every room is doing.
      </p>

      <div className="mt-8 rounded-2xl bg-slate-50 p-5 ring-1 ring-slate-200">
        {release?.apkUrl ? (
          /*
           * `apkUrl`, not `downloadUrl`. The two are different
           * addresses and conflating them made this button link to the
           * page it is on — which is what opening it in a browser
           * found, and what a 200 would never have shown.
           */
          <a
            href={release.apkUrl}
            className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-6 py-3 text-base font-bold text-white transition hover:bg-brand-700"
          >
            Download version {release.latest}
          </a>
        ) : (
          /*
           * No build uploaded yet, or the API is quiet. Saying so is
           * better than a dead button: somebody who presses nothing and
           * gets nothing assumes the app is gone.
           */
          <p className="text-sm font-semibold text-slate-700">
            The download is briefly unavailable. Please try again in a minute.
          </p>
        )}
        {release ? (
          <p className="mt-3 text-xs text-slate-500">
            Version {release.latest} · Android 7 and newer
            {release.minimum && release.minimum !== "0.0.0"
              ? ` · versions below ${release.minimum} can no longer sign in`
              : ""}
          </p>
        ) : null}
        {release?.notes ? (
          <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{release.notes}</p>
        ) : null}
      </div>

      <h2 className="mt-10 text-lg font-bold text-slate-900">Installing it</h2>
      <ol className="mt-4 space-y-4">
        {STEPS.map((s, i) => (
          <li key={s.head} className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
              {i + 1}
            </span>
            <div>
              <div className="text-sm font-semibold text-slate-900">{s.head}</div>
              <p className="mt-0.5 text-sm text-slate-600">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      {/*
        iPhone staff are a real part of a resort's team and the honest
        answer to them today is "not yet". Saying nothing at all reads
        as an oversight and produces the same support call every week.
      */}
      <h2 className="mt-10 text-lg font-bold text-slate-900">On an iPhone</h2>
      <p className="mt-2 text-sm text-slate-600">
        Not yet. Until then the console works in Safari — sign in at{" "}
        <a href="/login" className="font-semibold text-brand-700 hover:underline">
          {brand.name}
        </a>{" "}
        and add it to your home screen.
      </p>
    </div>
  );
}
