import type { Metadata } from "next";

/**
 * The section's own title, for `/agent` itself.
 *
 * Every screen under here declares its own and overrides this one; what this
 * covers is the bare `/agent`, which is a redirect rather than a screen and
 * would otherwise show the brand alone in the tab while it decides where to
 * send you.
 */
export const metadata: Metadata = { title: "Agency" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
