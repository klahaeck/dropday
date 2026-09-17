import { defineConfig, devices } from "@playwright/test";

const localChromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const localLaunchOptions = localChromiumExecutable
  ? { launchOptions: { executablePath: localChromiumExecutable } }
  : {};

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["github"]] : "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], ...localLaunchOptions } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"], ...localLaunchOptions } },
  ],
  webServer: {
    command: "NEXT_PUBLIC_DEMO_MODE=true npm run dev -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/app",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
