import { defineConfig } from 'vitest/config'
import viteReact from '@vitejs/plugin-react'

// Deliberately does NOT load the TanStack Start plugin: unit and component
// tests exercise modules directly and have no business building server
// entries. Integration coverage lives in Playwright (PR 7.1).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [viteReact()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'tests/unit/**/*.{test,spec}.{ts,tsx}',
    ],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      exclude: ['**/*.gen.ts', '**/*.config.ts', 'tests/**'],
    },
  },
})
