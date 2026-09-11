import { cache } from "react";
import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/components/ui";
import { QueryProvider } from "@/lib/query";
import { fetchBrand } from "@/lib/brand";
import { BrandProvider } from "@/lib/brand-context";

// once per request, for the metadata and the page below it
const brandOnce = cache(() => fetchBrand());

export async function generateMetadata(): Promise<Metadata> {
  const brand = await brandOnce();
  return {
    /**
     * Every screen names itself, and the brand is the suffix — "Bookings ·
     * Resort Mela". The tab used to read "Resort Mela — Admin" on all of
     * them, which tells a person with six tabs open nothing at all.
     *
     * Each route carries its own `title` in a small server layout beside its
     * page (the pages are client components and cannot export metadata); this
     * template wraps whatever they say, and `default` covers anything that
     * says nothing.
     */
    title: { default: brand.name, template: `%s · ${brand.name}` },
    description: "Multi-resort booking & activities platform",
    /**
     * The owner's icon when they have set one, the mark we ship otherwise.
     *
     * The default lives in `public/`, not as `app/icon.svg`: Next's
     * file-based metadata outranks anything named here, so while that file
     * existed the tab could never show the owner's icon.
     */
    icons: { icon: brand.icon ?? "/icon.svg" },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const brand = await brandOnce();
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <QueryProvider>
          <AuthProvider>
            <BrandProvider brand={brand}>
              <ToastProvider>{children}</ToastProvider>
            </BrandProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
