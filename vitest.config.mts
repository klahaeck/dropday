import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/lib/**/*.ts", "src/app/api/**/route.ts"],
      exclude: ["src/**/*.test.ts", "src/lib/demo-data.ts"],
      thresholds: {
        lines: 35,
        functions: 35,
        branches: 30,
        statements: 35,
      },
    },
  },
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
});
