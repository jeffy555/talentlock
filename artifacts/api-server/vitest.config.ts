import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    environment: "node",
    setupFiles: ["tests/setup/vitest.setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    passWithNoTests: false,
    poolOptions: {
      forks: {
        singleFork: false,
      },
    },
  },
});
