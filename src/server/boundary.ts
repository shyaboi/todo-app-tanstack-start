import '@tanstack/react-start/server-only'
import { toSafeError, toWireMessage } from './errors'

/**
 * The last thing that happens to an error before it leaves the server.
 *
 * Services throw `AppError`, which carries a code, a safe message and an id
 * that matches a log line. None of that survives serialisation except the
 * message, so this re-throws a plain Error whose message carries the code and
 * the id in a tag the client strips (see WIRE_TAG).
 *
 * It sits at the server-function boundary rather than in the service, so the
 * service layer keeps throwing real AppErrors -- which is what the permission
 * suites assert on, and what the logger reads.
 */
export async function wire<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    throw new Error(toWireMessage(toSafeError(error)))
  }
}
