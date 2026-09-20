import { createRequire } from 'node:module'
import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitroV2Plugin } from '@tanstack/nitro-v2-vite-plugin'

/* nft traces from real files, so the driver has to be named by its resolved
   entry rather than by its package name. */
const resolveFromHere = createRequire(import.meta.url).resolve

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
    /* The deploy target. Without it the build emits a plain Node server at
       dist/server/server.js and nothing else -- no HTML, since every page is
       rendered per request. A host that serves the output directory then has
       nothing to answer '/' with, which is a 404 on every path rather than an
       error anyone can read.

       Nitro turns that same server into whatever the host expects; 'vercel'
       writes .vercel/output (the Build Output API), which Vercel runs in
       preference to any output directory, so no dashboard setting changes.
       The preset is read from an env var Vercel sets itself, so a local build
       stays a plain Node server and `npm start` keeps working. */
    nitroV2Plugin({
      preset: process.env.VERCEL ? 'vercel' : 'node-server',
      /* The Mongo driver is never bundled.

         It is CommonJS and reaches for `crypto` through a conditional
         `require`, which the bundler rewrites into something that resolves to
         WebCrypto. The driver then decides Node's crypto is unavailable and
         refuses to authenticate: "Node.js crypto module is required for
         SCRAM-SHA-1 authentication" -- at request time, on a build that
         looked perfectly healthy.

         Left external it is imported at runtime and traced into the output's
         node_modules intact, which is also what the driver's own docs ask for. */
      externals: {
        external: ['mongodb'],
        /* Traced by name rather than discovered: the bundle only ever mentions
           the driver in an import statement, and a serverless function ships
           with whatever was traced into it -- a locally correct build that is
           missing a dependency in production is the failure mode to avoid. */
        traceInclude: [resolveFromHere('mongodb')],
        trace: true,
      },
      rollupConfig: { external: [/^mongodb$/, /^mongodb\//] },
    }),
  ],
})
