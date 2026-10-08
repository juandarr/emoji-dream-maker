import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";
// All provider calls are intercepted by the browser fixtures, including GIFs.
process.env.NEXT_PUBLIC_GIPHY_API_KEY ||= "test-browser-key";
// Give tests their own server; reusing :3000 can silently test another checkout.
const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3100";
const port = new URL(baseURL).port || "3100";
// Isolate test accounts and build output from the developer's running app.
process.env.BETTER_AUTH_URL=baseURL;
process.env.BETTER_AUTH_SECRET="browser-test-only-secret-at-least-32-characters";
process.env.PLAYWRIGHT_ACCOUNT_DB_PATH ||= join(tmpdir(),`emoji-e2e-${randomUUID()}.sqlite`);
process.env.ACCOUNT_DB_PATH=process.env.PLAYWRIGHT_ACCOUNT_DB_PATH;
process.env.INVITATION_PHRASE="small symbols infinite possibilities";
process.env.INVITATION_EMOJI_ID="1F419";
process.env.NEXT_DIST_DIR=".next-e2e";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: { command: `npm run dev -- --port ${port}`, url: `${baseURL}/login`, reuseExistingServer: false, timeout: 120000 },
});
