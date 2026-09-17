import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.dom.test.tsx"],
    setupFiles: ["./src/test/setup-dom.ts"],
    restoreMocks: true,
  },
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
});
