import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.spec.ts"],
    environment: "node",
    // Integration specs share one database and truncate it between tests, so
    // two files running at once would wipe each other's fixtures mid-test.
    // The whole suite is a few seconds, so serialising files costs nothing.
    fileParallelism: false,
  },
});
