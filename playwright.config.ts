import { defineConfig, devices } from "@playwright/test";

// Env vars are loaded by scripts/e2e-setup.mjs before Playwright is
// invoked, so `process.env` here already reflects `.env.test` values.
// That avoids pulling in dotenv as a test-only dependency.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e/tests",

  // Each spec gets its own worker. Supabase + Next.js can handle the
  // parallelism locally, and CI runners have 2 cores by default.
  fullyParallel: true,

  // CI guardrails — catch "I left a `.only` on a test" before review,
  // retry flakes twice (network blips from Supabase container startup
  // are the main offender), and cap workers so cold-starts don't stack.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,

  reporter: [["html", { open: "never" }], ["list"]],

  use: {
    baseURL,
    // Trace on first retry only — full traces are expensive to produce
    // and the vast majority of green runs don't need them. Failed runs
    // upload the trace as a CI artifact for post-mortem.
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // App is a PWA targeting mobile — run the whole suite at a phone
    // viewport so layout regressions (sticky bars, PulseRing overlap)
    // show up.
    ...devices["Pixel 7"],
  },

  // Boot the Next.js server automatically. CI builds once and serves
  // the production output — faster + closer to what users hit. Locally
  // we reuse whatever dev server is already running so you can
  // `npm run dev` in one terminal and `npm run e2e` in another without
  // fighting for port 3000.
  webServer: {
    command: process.env.CI ? "npm run start" : "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Next.js inherits the env from the parent process (loaded by
    // scripts/e2e-setup.mjs), so it connects to local Supabase.
  },

  projects: [
    // The `setup` project runs once before any test project. It
    // creates the super-admin (if not already seeded) and persists
    // the session to disk so every spec can reuse it via storageState.
    { name: "setup", testMatch: /.*\.setup\.ts/ },

    {
      name: "chromium",
      use: {
        ...devices["Pixel 7"],
        storageState: "playwright/.auth/super-admin.json",
      },
      dependencies: ["setup"],
    },
  ],
});
