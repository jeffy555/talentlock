import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

const isCi = Boolean(process.env.CI);
const junitOutput = process.env.VITEST_JUNIT_FILE ?? "test-results/junit.xml";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    passWithNoTests: false,
    reporters: isCi
      ? ["default", ["junit", { outputFile: junitOutput }]]
      : ["default"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
});
