"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_BRAND, type Brand } from "./brand";

/**
 * The brand, handed down from the server render.
 *
 * It arrives with the first HTML rather than being fetched in the browser, so
 * the owner's logo is what paints — a client fetch would show ours first and
 * swap it a moment later, which is exactly how a brand looks broken.
 */
const BrandContext = createContext<Brand>(DEFAULT_BRAND);

export function BrandProvider({ brand, children }: { brand: Brand; children: ReactNode }) {
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

export function useBrand(): Brand {
  return useContext(BrandContext);
}
