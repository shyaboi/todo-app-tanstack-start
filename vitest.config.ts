import { defineConfig } from 'vitest/config'
import viteReact from '@vitejs/plugin-react'

// Deliberately does NOT load the TanStack Start plugin: unit and component
// tests exercise modules directly and have no business building server
// entries. Full-stack coverage lives in Playwright.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    /* Three projects, split structurally rather than per file.
       - ui:          jsdom, component and hook tests
       - server:      node, because server code under jsdom would see a `window`
                      that will never exist in production, which is exactly the
                      mistake the env guard exists to catch
       - integration: node AND a live MongoDB, so it is not part of `npm test` */
    projects: [
      {
        plugins: [viteReact()],
        resolve: { tsconfigPaths: true },
        test: {
          name: 'ui',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./tests/setup.ts'],
          /* src/shared is browser-facing code, so its .ts tests run under
             jsdom too -- keys.ts builds DOM elements to classify targets, and
             the toast store is read through a React hook. Before this line
             those files matched neither project and silently never ran. */
          include: [
            'src/**/*.test.tsx',
            'src/shared/**/*.test.ts',
            'tests/unit/**/*.test.{ts,tsx}',
          ],
          exclude: ['src/server/**', '**/*.integration.test.*'],
        },
      },
      {
        resolve: { tsconfigPaths: true },
        test: {
          name: 'server',
          environment: 'node',
          globals: true,
          include: ['src/server/**/*.test.ts', 'src/features/**/*.test.ts'],
          exclude: ['**/*.integration.test.*'],
        },
      },
      {
        /* Requires a running MongoDB. Kept a separate project, and out of
           `npm test`, so a missing database fails loudly instead of being
           mistaken for a passing unit suite. CI gives it a throwaway database. */
        resolve: { tsconfigPaths: true },
        test: {
          name: 'integration',
          environment: 'node',
          globals: true,
          setupFiles: ['./tests/integration-setup.ts'],
          include: ['src/**/*.integration.test.ts'],
          testTimeout: 20_000,
          hookTimeout: 20_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      exclude: ['**/*.gen.ts', '**/*.config.ts', 'tests/**'],
    },
  },
})
