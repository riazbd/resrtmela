import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // no jsdom: this package is shared with React Native, so anything here
    // that needs a browser to be tested is in the wrong package
    environment: "node",
    include: ["test/**/*.spec.{ts,tsx}"],
  },
});
