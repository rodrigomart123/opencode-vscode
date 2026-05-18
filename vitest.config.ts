import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      exclude: ["node_modules/", "dist/", "**/*.test.ts", "media/"],
    },
  },
  resolve: {
    alias: {
      "vscode": "<rootDir>/src/__mocks__/vscode.ts",
    },
  },
});
