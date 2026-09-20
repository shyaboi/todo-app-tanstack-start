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
      /* Response headers the app was shipping none of (PLAN.md 9.1). Set on
         the server rather than in a host dashboard so they travel with the
         code and are the same on every deployment.

         `frame-ancestors 'none'` is the one that closes a real hole: the app
         is cookie-authenticated and one click deletes a task. SameSite=Lax
         already means a cross-site frame gets a fresh guest rather than the
         victim's session, so this is the second lock, not the first.

         The CSP allows 'unsafe-inline' for scripts, and it is worth being
         plain about why rather than quietly shipping a CSP that looks
         stronger than it is: the SSR payload is an inline <script> written by
         the framework, and TanStack Start does not expose a nonce to put on
         it. What the policy still buys is real -- no script may be LOADED
         from another origin, no object or base tag, no form posting
         elsewhere, and nothing framed. Stored XSS tested clean (six payloads,
         every sink), so this is defence in depth rather than the thing
         holding the line. A nonce, when the framework offers one, removes the
         'unsafe-inline' and nothing else here changes. */
      routeRules: {
        '/**': {
          headers: {
            'content-security-policy': [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data:",
              "font-src 'self'",
              "connect-src 'self'",
              "form-action 'self'",
              "base-uri 'none'",
              "object-src 'none'",
              "frame-ancestors 'none'",
            ].join('; '),
            // Belt and braces for frame-ancestors, for anything that predates it.
            'x-frame-options': 'DENY',
            // A .js served as text/plain must not be executed as a script.
            'x-content-type-options': 'nosniff',
            // A task title can end up in a path; do not send it to other sites.
            'referrer-policy': 'strict-origin-when-cross-origin',
            'permissions-policy': 'camera=(), microphone=(), geolocation=()',
            // Two years, and only meaningful over https, which is where it is
            // served. Local development is http and never sees this.
            'strict-transport-security':
              'max-age=63072000; includeSubDomains; preload',
          },
        },
      },
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
