import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT ?? "3000");
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: baseURL,
    timeout: 180 * 1000,
    reuseExistingServer: !process.env.CI,
    env: {
      ...process.env,
      NEXT_PUBLIC_FLOW1_ONLY: process.env.NEXT_PUBLIC_FLOW1_ONLY ?? "true",
      NEXT_PUBLIC_FLOW2_ENABLED: process.env.NEXT_PUBLIC_FLOW2_ENABLED ?? "false",
      NEXT_PUBLIC_FLOW3_ENABLED: process.env.NEXT_PUBLIC_FLOW3_ENABLED ?? "false",
      NEXT_PUBLIC_FLOW4_ENABLED: process.env.NEXT_PUBLIC_FLOW4_ENABLED ?? "false",
      NEXT_PUBLIC_FLOW5_ENABLED: process.env.NEXT_PUBLIC_FLOW5_ENABLED ?? "false",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
