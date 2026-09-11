import type { Metadata } from "next";
import { fetchBrand } from "@/lib/brand";

/**
 * Signup, and the agency signup nested under it.
 *
 * This segment carries a template of its own as well as its title: a child
 * segment does not inherit the root's template through a parent that sets a
 * plain string, so `/signup/agency` came out as "Sign up your agency" with no
 * brand after it.
 */
export async function generateMetadata(): Promise<Metadata> {
  const brand = await fetchBrand();
  // `default` is this screen's own name — the root template adds the brand to
  // it; `template` is for the segment below, which the root's does not reach
  return { title: { default: "Create your workspace", template: `%s · ${brand.name}` } };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
