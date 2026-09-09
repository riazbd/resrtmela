import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    // forks + jsdom trips over undici's globals on Node 20; threads is fine
    pool: "threads",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.spec.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
});
