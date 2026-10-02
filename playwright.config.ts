import { defineConfig, devices } from "@playwright/test";
// All provider calls are intercepted by the browser fixtures, including GIFs.
process.env.NEXT_PUBLIC_GIPHY_API_KEY ||= "test-browser-key";
// Give tests their own server; reusing :3000 can silently test another checkout.
const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3100";
const port = new URL(baseURL).port || "3100";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: { command: `npm run dev -- --port ${port}`, url: baseURL, reuseExistingServer: false, timeout: 120000 },
});
