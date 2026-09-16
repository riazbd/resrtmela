import type { Metadata } from "next";

// never indexed: a preview is the owner's, and its address is not the site's
export const metadata: Metadata = { title: "Preview", robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
