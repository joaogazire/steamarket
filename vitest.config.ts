import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    environmentMatchGlobs: [["src/content/**", "jsdom"], ["src/ajustes/**", "jsdom"]],
    passWithNoTests: true,
  },
});
