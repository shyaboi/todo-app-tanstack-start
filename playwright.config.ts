import { defineConfig, devices } from '@playwright/test'

// The critical-path flow lands in PR 7.1. This config exists from Sprint 0 so
// the harness is never the thing that blocks writing the first E2E test.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    // Tests write real rows, so they get their own database and never touch
    // the seeded demo data. CI supplies both of these itself.
    env: {
      MONGODB_DB: process.env.MONGODB_DB ?? 'tasker_e2e',
    },
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
