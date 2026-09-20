import '@tanstack/react-start/server-only'
import { toSafeError } from './errors'
import { logger } from './logger'

/**
 * Wraps a domain operation so no driver error can escape unsanitised, and so
 * every failure leaves one log line with the same shape: operation · error
 * class · duration · entity id, and the id the user was shown (PLAN.md 4.7,
 * vector 4). Shared by every service; a second copy would be a second place
 * for the rule to drift.
 */
export async function run<T>(
  operation: string,
  entityId: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const started = Date.now()
  try {
    return await fn()
  } catch (error) {
    const safe = toSafeError(error)
    logger.error('operation failed', {
      operation,
      entityId,
      errorId: safe.errorId,
      errorClass: error instanceof Error ? error.name : typeof error,
      durationMs: Date.now() - started,
    })
    throw safe
  }
}
