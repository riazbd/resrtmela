import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // node, with no DOM and no React: this package is imported by the API, the
    // console and the phone, and anything needing a browser to be tested is in
    // the wrong package
    environment: "node",
    include: ["test/**/*.spec.ts"],
  },
});
