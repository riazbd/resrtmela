import type { Metadata } from "next";

// the tab says which screen this is; the brand is the suffix (app/layout.tsx)
export const metadata: Metadata = { title: "Discover resorts" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
