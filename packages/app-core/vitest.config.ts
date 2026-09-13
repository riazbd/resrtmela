import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    /**
     * jsdom is the *harness*, not a permission.
     *
     * Nothing in `src` may touch `window`, `document` or react-dom — this
     * package is imported by React Native, where none of those exist. But its
     * hooks are React, and rendering a hook to test it needs some renderer;
     * react-dom in jsdom is the one this repo already has. The rule the tests
     * enforce is in `no-browser-in-here.spec.ts`, not in this line.
     */
    environment: "jsdom",
    // forks + jsdom trips over undici's globals on Node 20; threads is fine
    pool: "threads",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.spec.{ts,tsx}"],
  },
});
