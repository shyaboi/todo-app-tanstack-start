/* Integration tests talk to a real database, so they need MONGODB_URI. Vitest
   does not read .env (unlike the dev server, where Vite loads it), so it is
   loaded explicitly here. In CI there is no .env and the variables come from
   the workflow environment, which is why a missing file is not an error. */
const explicit = { ...process.env }
try {
  process.loadEnvFile('.env')
} catch {
  // No .env; the ambient environment is all there is.
}
// Explicit wins over the file, so MONGODB_DB=... on the command line is honoured.
Object.assign(process.env, explicit)

/* Never the developer's own database. An integration run deletes collections,
   so it defaults to a throwaway name and only honours an override that is
   clearly not the app's default. */
if (!process.env.MONGODB_DB || process.env.MONGODB_DB === 'tasker') {
  process.env.MONGODB_DB = 'tasker_integration'
}
