// Marks this module server-only. The TanStack Start import-protection plugin
// traces the module graph and fails the BUILD if anything reachable from the
// client imports it -- a stronger guarantee than a lint rule, because it
// catches transitive imports too. PLAN.md 4.7, vector 2.
import '@tanstack/react-start/server-only'
import { z } from 'zod'

/* Deliberately no VITE_ prefix anywhere in this file. Vite inlines every
   VITE_* variable into the browser bundle -- the prefix IS the publication
   mechanism, so a secret must never carry one. */
const envSchema = z.object({
  MONGODB_URI: z
    .string({ error: 'MONGODB_URI is required' })
    .min(1, 'MONGODB_URI is required')
    .refine(
      (v) => v.startsWith('mongodb://') || v.startsWith('mongodb+srv://'),
      {
        message:
          'MONGODB_URI must be a mongodb:// or mongodb+srv:// connection string',
      },
    ),
  MONGODB_DB: z.string().min(1).default('tasker'),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
})

export type Env = z.infer<typeof envSchema>

/* Belt and braces: even if the bundler guard were mis-configured, evaluating
   this module in a browser throws immediately rather than shipping quietly. */
function assertServer(): void {
  if (typeof window !== 'undefined') {
    throw new Error(
      'src/server/env.ts was evaluated in a browser. It reads credentials and ' +
        'must never reach the client bundle. Reach the database through a ' +
        'server function instead.',
    )
  }
}

let cached: Env | null = null

/**
 * Parsed once, then cached. Throws on the first call if configuration is
 * missing or malformed, so the process fails at startup with a readable
 * message rather than at the first query with a driver error.
 */
export function env(): Env {
  assertServer()
  if (cached) return cached

  const parsed = envSchema.safeParse(process.env)

  if (!parsed.success) {
    // Report which keys are wrong and why -- never the values, which are the
    // secrets themselves.
    const problems = parsed.error.issues
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n')
    throw new Error(
      `Invalid environment configuration:\n${problems}\n\n` +
        'Copy .env.example to .env and fill it in.',
    )
  }

  cached = parsed.data
  return cached
}

/** Test-only: drops the memoised value so a suite can vary the environment. */
export function resetEnvCache(): void {
  cached = null
}
