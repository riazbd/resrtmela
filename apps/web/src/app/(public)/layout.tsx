import type { Metadata } from "next";
import { fetchBrand } from "@/lib/brand";

/**
 * The `(public)` group's only page left is the homepage, and it renders its
 * own header, nav and footer — a guest booking flow used to live alongside
 * it and needed this file's chrome to get around between its own pages. With
 * that flow gone, there is nothing left in the group for a shared frame to
 * wrap around.
 */
export async function generateMetadata(): Promise<Metadata> {
  const brand = await fetchBrand();
  // the front door is the brand itself, so it takes the tab whole rather than
  // arriving as "Home · Resort Mela"
  return { title: { absolute: `${brand.name} — resort management platform` } };
}

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <main>{children}</main>;
}
