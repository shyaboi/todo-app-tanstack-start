import { defineConfig } from 'vitest/config'
import viteReact from '@vitejs/plugin-react'

// Deliberately does NOT load the TanStack Start plugin: unit and component
// tests exercise modules directly and have no business building server
// entries. Integration coverage lives in Playwright (PR 7.1).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    /* Two environments, split structurally rather than per file. Server code
       under jsdom would see a `window` that will never exist in production --
       which is exactly the mistake the env guard is there to catch, so the
       test environment must not paper over it. */
    projects: [
      {
        plugins: [viteReact()],
        resolve: { tsconfigPaths: true },
        test: {
          name: 'ui',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./tests/setup.ts'],
          include: ['src/**/*.test.{ts,tsx}', 'tests/unit/**/*.test.{ts,tsx}'],
          exclude: ['src/server/**'],
        },
      },
      {
        resolve: { tsconfigPaths: true },
        test: {
          name: 'server',
          environment: 'node',
          globals: true,
          include: ['src/server/**/*.test.ts'],
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
