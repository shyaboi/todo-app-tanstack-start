export {}

/* Verifies the connection and the env boundary end to end: `npm run db:check`.
   Prints no part of the connection string. */

// Must happen before src/server/env is imported, so the import is dynamic.
// In CI the variables come from the real environment and there is no .env.
const { loadEnv } = await import('./load-env')
loadEnv()

const { getDb, closeClient } = await import('../src/server/db')
const { toSafeError } = await import('../src/server/errors')
const { env } = await import('../src/server/env')

const started = Date.now()
try {
  const db = await getDb()
  const ping = await db.command({ ping: 1 })
  const collections = await db.listCollections().toArray()
  console.warn(
    [
      `  database    ${env().MONGODB_DB}`,
      `  ping        ${ping.ok === 1 ? 'ok' : 'unexpected'}`,
      `  collections ${collections.length === 0 ? '(none yet)' : collections.map((c) => c.name).join(', ')}`,
      `  round trip  ${Date.now() - started}ms`,
    ].join('\n'),
  )
} catch (error) {
  const safe = toSafeError(error)
  // Exactly what a user would see -- proof that no credential is in it.
  console.error(`  failed      ${safe.code}: ${safe.message}`)
  console.error(`  errorId     ${safe.errorId}`)
  process.exitCode = 1
} finally {
  await closeClient()
}
