import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'

export default defineConfig({
  // Pinned so the Playwright webServer URL, the README and CI all agree.
  server: { port: 3000 },
  // Vite 8 resolves tsconfig `paths` natively; no plugin needed.
  resolve: { tsconfigPaths: true },
  plugins: [
    tanstackStart({
      /* PLAN.md 4.7 vector 2, enforced by the bundler rather than by
         convention. This traces the module graph, so it also catches a
         component that reaches src/server indirectly through a helper --
         which the ESLint rule, matching only literal import paths, cannot. */
      importProtection: {
        enabled: true,
        behavior: 'error',
        client: {
          specifiers: ['mongodb', /^node:/],
          files: [/[\\/]src[\\/]server[\\/]/],
        },
      },
    }),
    viteReact(),
  ],
})
