import type { Metadata } from "next";

// the tab says which screen this is; the brand is the suffix (app/layout.tsx)
export const metadata: Metadata = { title: "Invoice" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
