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
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    /* --mode e2e, not an `env` override. Vite loads .env into the server
       process itself and it wins over anything Playwright passes in, so the
       env option here silently did nothing and tests wrote to the real
       database. A mode-specific .env.e2e is the one thing Vite ranks above
       .env. CI has no .env at all and sets the variables directly.

       Its own port, and never a reused server. With reuse on, a developer's
       `npm run dev` still listening on 3000 was silently adopted -- mode and
       database included -- and the suite wrote to the real database. On 3001
       with strictPort, a collision fails loudly instead. */
    command: 'npm run dev:e2e',
    url: 'http://localhost:3001',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
