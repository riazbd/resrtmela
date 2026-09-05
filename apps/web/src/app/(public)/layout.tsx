"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getToken } from "@/lib/api";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const logged = typeof window !== "undefined" && !!getToken();
  // the homepage is fully immersive — it renders its own chrome
  if (pathname === "/") return <main>{children}</main>;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white sticky top-0 z-40">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/book" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">R</div>
            <span className="text-lg font-bold text-slate-900">Resort Mela</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link
              href="/book"
              className={pathname === "/book" ? "font-semibold text-brand-700" : "text-slate-500 hover:text-slate-800"}
            >
              Resorts
            </Link>
            {logged && (
              <Link
                href="/book/trips"
                className={pathname === "/book/trips" ? "font-semibold text-brand-700" : "text-slate-500 hover:text-slate-800"}
              >
                My trips
              </Link>
            )}
            <Link href="/login" className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
              Staff login
            </Link>
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-400">
        Resort Mela — book your next stay
      </footer>
    </div>
  );
}
