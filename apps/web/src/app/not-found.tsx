import Link from "next/link";

/** A wrong URL should offer a way out, not a stack trace or an empty page. */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-5xl font-black text-slate-200">404</p>
      <div>
        <h1 className="text-lg font-bold text-slate-900" lang="bn">পাতাটি খুঁজে পাওয়া যায়নি</h1>
        <p className="text-sm text-slate-500">This page does not exist.</p>
      </div>
      <Link
        href="/daysheet"
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
      >
        দিনলিপিতে ফিরে যান · Back to the Day Sheet
      </Link>
    </div>
  );
}
