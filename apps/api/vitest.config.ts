import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.spec.ts"],
    environment: "node",
    // Integration specs share one database and empty it between tests, so two
    // files running at once would wipe each other's fixtures mid-test. The
    // suite runs in about three minutes serialised; most of what is left is
    // module import, not the database.
    fileParallelism: false,
  },
});
