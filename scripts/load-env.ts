/**
 * Loads .env without letting it override variables already set.
 *
 * `process.loadEnvFile` overwrites what is already in the environment, so
 * `MONGODB_DB=tasker_e2e npm run seed` would silently seed the database named
 * in .env instead -- which is how a test run ends up writing to real data.
 * Explicit wins over the file, which is the order every other tool uses.
 */
export function loadEnv(file = '.env'): void {
  const explicit = { ...process.env }
  try {
    process.loadEnvFile(file)
  } catch {
    // No such file; the ambient environment is all there is.
  }
  Object.assign(process.env, explicit)
}
