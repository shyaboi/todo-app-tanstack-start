import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'

export default defineConfig({
  // Pinned so the Playwright webServer URL, the README and CI all agree.
  server: { port: 3000 },
  // Vite 8 resolves tsconfig `paths` natively; no plugin needed.
  resolve: { tsconfigPaths: true },
  plugins: [tanstackStart(), viteReact()],
})
