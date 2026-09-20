import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join } from 'node:path'
import { loadEnv } from '../../scripts/load-env'

/**
 * The built artifact (PLAN.md 8.2, §8).
 *
 * Every other tier tests SOURCE: unit tests import modules directly, and
 * Playwright drives `vite dev`. Nothing among them ever loads the bundle that
 * actually ships -- which is how a build that passed every check reached a
 * deployment and returned 404 on every path, and how a second one booted and
 * then failed its first database call with "Node.js crypto module is required
 * for SCRAM-SHA-1 authentication" (§9). Both were invisible until a person
 * opened the hosted URL.
 *
 * So this boots `.output/server/index.mjs` -- the real file the host runs --
 * and asks it for a page. It is the cheapest test in the suite and the only
 * one that would have caught either failure.
 *
 * It needs `npm run build` first, and a MongoDB. It gets its own database,
 * because it only proves the server can reach one, not what is in it.
 */

/* At module scope, not in beforeAll: the secret scan below builds its list of
   forbidden values while the file is being COLLECTED, which is before any
   hook has run. Loaded the same way the scripts do it -- the ambient
   environment wins, so CI needs no file at all. */
loadEnv('.env')

const OUTPUT = '.output'
const SERVER = join(OUTPUT, 'server', 'index.mjs')
const ASSETS = join(OUTPUT, 'public', 'assets')
const PORT = 3010
const base = `http://127.0.0.1:${PORT}`

/** Client JS, gzipped, in bytes. The plan's budget is per route (PLAN.md 8.2). */
const ROUTE_JS_BUDGET = 120 * 1024

let server: ChildProcess | undefined
let homepage = ''

beforeAll(async () => {
  if (!existsSync(SERVER)) {
    throw new Error(
      `${SERVER} is missing. This tier tests the BUILT app: run \`npm run build\` first.`,
    )
  }

  server = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      PORT: String(PORT),
      // Its own database. Nothing here reads seeded data, and a test that can
      // write to the real one is a test that eventually does.
      MONGODB_DB: 'tasker_artifact',
      NODE_ENV: 'production',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const log: string[] = []
  server.stdout?.on('data', (c: Buffer) => log.push(c.toString()))
  server.stderr?.on('data', (c: Buffer) => log.push(c.toString()))

  // Poll rather than parse the banner: the banner is nitro's to change, the
  // port answering is the thing actually being waited for.
  const deadline = Date.now() + 30_000
  for (;;) {
    if (server.exitCode !== null) {
      throw new Error(`the built server exited early:\n${log.join('')}`)
    }
    try {
      const res = await fetch(base + '/')
      homepage = await res.text()
      break
    } catch {
      if (Date.now() > deadline) {
        throw new Error(`the built server never answered:\n${log.join('')}`)
      }
      await new Promise((r) => setTimeout(r, 250))
    }
  }
}, 60_000)

afterAll(() => {
  server?.kill()
})

describe('the built server', () => {
  it('serves the app at /, rendered rather than shipped empty', async () => {
    const res = await fetch(base + '/')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    const html = await res.text()
    // The list is IN the HTML: the loader ran on the server, which means the
    // server function, the service, the repo and the driver all worked.
    expect(html).toContain('<h1')
    expect(html).toContain('Inbox')
  })

  it('serves every route, not just the one the build happened to emit', async () => {
    // /board returned 404 on the first deployment -- there was no server at
    // all, only static files, and nothing in the pipeline said so.
    for (const path of ['/board', '/sign-in', '/sign-up']) {
      const res = await fetch(base + path)
      expect(`${path} -> ${res.status}`).toBe(`${path} -> 200`)
    }
  })

  it('ran a server function against a real database while rendering', () => {
    /* Not by calling `/_serverFn/<id>` directly: its payload is seroval, an
       internal wire format, and a test that hand-rolls it is testing
       TanStack's serializer rather than this app.

       The loader is the honest equivalent and a stricter one. Rendering `/`
       runs listTodos -> listTasks -> the repo -> the driver -> MongoDB, and
       dehydrates the RESULT into the HTML. A ["tasks"] entry that says
       "success" cannot exist unless every one of those worked inside the
       bundle -- and that is precisely the call that failed in production with
       a crypto error while every other test was green. */
    expect(homepage).toContain('["tasks"]')
    expect(homepage).toMatch(/queryKey:[^;]*\["tasks"\]/)
    expect(homepage).toMatch(/status:\s*"success"/)
  })

  it('renders a page well inside the budget, warm', async () => {
    /* The plan asks for a Lighthouse first-paint under 1.0s. Lighthouse is
       not gated here: on a shared CI runner its timings vary by more than the
       budget itself, so it would fail for reasons that have nothing to do
       with the change under review. It is a manual step in the README
       instead (§8, step 12).

       What IS gated is the part this repo controls and can measure
       repeatably: how long the server takes to render a page. The bound is
       deliberately loose -- it is here to catch a render that started doing a
       query per row, not to police tens of milliseconds. */
    const started = performance.now()
    const res = await fetch(base + '/')
    await res.text()
    const ms = Math.round(performance.now() - started)
    expect(`rendered in ${ms}ms`).toBe(
      ms < 1500 ? `rendered in ${ms}ms` : 'rendered in under 1500ms',
    )
  })

  it('sends the security headers on every response', async () => {
    /* Gated HERE rather than in Playwright because `vite dev` does not run
       through nitro, so the headers are absent in development and a spec
       against the dev server could never see them. The built artifact is
       where they exist and where they matter (PLAN.md 9.1).

       The app shipped none of these until the Sprint 9 audit. `frame-ancestors`
       is the one that closes a real hole: this is a cookie-authenticated app
       where one click deletes a task. */
    const res = await fetch(base + '/')
    const header = (name: string) => res.headers.get(name) ?? '(absent)'

    expect(header('x-frame-options')).toBe('DENY')
    expect(header('x-content-type-options')).toBe('nosniff')
    expect(header('referrer-policy')).toBe('strict-origin-when-cross-origin')
    expect(header('strict-transport-security')).toContain('max-age=')
    expect(header('permissions-policy')).toContain('camera=()')

    const csp = header('content-security-policy')
    for (const directive of [
      "default-src 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
    ]) {
      expect(`csp: ${directive}`).toBe(
        csp.includes(directive) ? `csp: ${directive}` : `csp is missing it`,
      )
    }
  })

  it('refuses a server function called from another origin', async () => {
    /* The cookie is SameSite=Lax, which stops a cross-site form post
       (PLAN.md 4.8). This is the second lock on the same door, and it is the
       one that holds for a request a script makes rather than a form. */
    const id = serverFnId('listTodos_createServerFn_handler')
    const res = await fetch(`${base}/_serverFn/${id}`, {
      headers: { accept: 'application/json', origin: 'https://evil.example' },
    })
    expect(res.status).toBe(403)
  })
})

describe('secrets never reach the client', () => {
  /* PLAN.md 4.7. The guards are elsewhere -- no VITE_ prefix, a browser-
     throwing env.ts, an import fence, a DTO-only cache. This is the assertion
     that they all held, made against the bytes that actually ship. */
  const forbidden = secretValues()

  it('has something to look for', () => {
    // A scan with nothing to scan for passes silently and proves nothing.
    expect(forbidden.length).toBeGreaterThan(0)
  })

  it.each(clientFiles())('%s contains no secret', (name) => {
    const text = readFileSync(join(ASSETS, name), 'latin1')
    for (const secret of forbidden) {
      expect(report(name, text, secret)).toBe(`${name}: clean`)
    }
  })

  it('the server-rendered HTML contains no secret', () => {
    /* The subtle vector (4.7, #3): the loader dehydrates the Query cache INTO
       the HTML, so anything put in that cache server-side is delivered to the
       browser in plain text. */
    for (const secret of forbidden) {
      expect(report('index.html', homepage, secret)).toBe('index.html: clean')
    }
    expect(homepage).not.toContain('ObjectId')
    expect(homepage).not.toContain('passwordHash')
  })
})

describe('the client bundle stays within budget', () => {
  it.each(clientFiles().filter((f) => f.endsWith('.js')))(
    '%s is under the route budget',
    (name) => {
      const kb = Math.round(
        gzipSync(readFileSync(join(ASSETS, name))).length / 1024,
      )
      const budget = ROUTE_JS_BUDGET / 1024
      expect(`${name}: ${kb}KB gzipped`).toBe(
        kb <= budget
          ? `${name}: ${kb}KB gzipped`
          : `${name}: at most ${budget}KB gzipped`,
      )
    },
  )
})

/* -- helpers -------------------------------------------------------------- */

function clientFiles(): string[] {
  return readdirSync(ASSETS).filter(
    (f) => f.endsWith('.js') || f.endsWith('.css') || f.endsWith('.map'),
  )
}

/**
 * The values that must never appear in anything the browser receives.
 *
 * Short or generic values are skipped deliberately: "tasker" as a database
 * name appears in a hundred harmless places, and a scan that reports it is a
 * scan people learn to ignore.
 */
function secretValues(): string[] {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    throw new Error(
      'MONGODB_URI is not set, so there is nothing to prove absent. ' +
        'This tier must run with the same configuration the build was given.',
    )
  }

  // The whole string, always: it is never a legitimate thing to ship.
  const values = [uri]
  try {
    const parsed = new URL(uri)
    /* A cluster hostname is an attack surface and worth scanning for. A LOCAL
       one is not a secret -- and "localhost" is nine characters, so a scan
       filtered only by length reports every bundle that mentions it. CI runs
       against mongodb://localhost:27017, so that is not hypothetical: it is
       what this test failed on the first time it ran there. */
    if (!isLocal(parsed.hostname)) values.push(parsed.hostname)
    if (parsed.username) values.push(decodeURIComponent(parsed.username))
    if (parsed.password) values.push(decodeURIComponent(parsed.password))
  } catch {
    // An unparseable URI is still scanned whole.
  }
  return [...new Set(values)].filter((v) => v.length >= 8)
}

function isLocal(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]'
  )
}

/** Reports a hit without printing the secret into a CI log. */
function report(name: string, haystack: string, secret: string): string {
  const at = haystack.indexOf(secret)
  if (at < 0) return `${name}: clean`
  return `${name}: LEAKED a ${secret.length}-character secret at offset ${at}`
}

function serverFnId(functionName: string): string {
  const entry = readFileSync(
    join(OUTPUT, 'server', 'chunks', 'virtual', 'entry.mjs'),
    'utf8',
  )
  const found = new RegExp(
    `"([0-9a-f]{16,})":\\s*\\{\\s*functionName:\\s*"${functionName}"`,
  ).exec(entry)
  if (!found) {
    throw new Error(`no server function called ${functionName} in the build`)
  }
  return found[1]!
}
