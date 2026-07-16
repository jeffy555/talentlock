import { defineConfig } from "vitest/config";

const isCi = Boolean(process.env.CI);
const junitOutput = process.env.VITEST_JUNIT_FILE ?? "test-results/junit.xml";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    environment: "node",
    setupFiles: ["tests/setup/vitest.setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    passWithNoTests: false,
    reporters: isCi
      ? ["default", ["junit", { outputFile: junitOutput }]]
      : ["default"],
    poolOptions: {
      forks: {
        singleFork: false,
      },
    },
  },
});
