import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_ID ?? "proj_dropday",
  runtime: "node",
  dirs: ["./src/trigger"],
  maxDuration: 120,
  logLevel: "info",
  retries: {
    default: { maxAttempts: 4, minTimeoutInMs: 1_000, maxTimeoutInMs: 30_000, factor: 2, randomize: true },
  },
});
