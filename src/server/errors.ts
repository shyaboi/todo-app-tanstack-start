import '@tanstack/react-start/server-only'

/* The error taxonomy the UI is allowed to see. PLAN.md 12: design errors
   intentionally rather than treating every failure as "Something went wrong".
   Each code maps to a message the user can act on. */
export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'NOT_FOUND',
  'DB_UNAVAILABLE',
  'CONFLICT',
  'UNKNOWN',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

/** The only error shape that crosses the wire. */
export interface AppErrorPayload {
  code: ErrorCode
  message: string
  /** Correlates the user-facing message with the server log line. */
  errorId: string
  /** Field-level messages, for forms. Never populated from a driver error. */
  fieldErrors?: Record<string, string>
}

export class AppError extends Error {
  readonly code: ErrorCode
  readonly errorId: string
  readonly fieldErrors: Record<string, string> | undefined
  readonly status: number

  constructor(
    code: ErrorCode,
    message: string,
    options: { fieldErrors?: Record<string, string>; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause })
    this.name = 'AppError'
    this.code = code
    this.errorId = newErrorId()
    this.fieldErrors = options.fieldErrors
    this.status = STATUS_BY_CODE[code]
  }

  /** Exactly what the client receives -- no cause, no stack, no config. */
  toPayload(): AppErrorPayload {
    return {
      code: this.code,
      message: this.message,
      errorId: this.errorId,
      ...(this.fieldErrors ? { fieldErrors: this.fieldErrors } : {}),
    }
  }
}

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  NOT_FOUND: 404,
  CONFLICT: 409,
  DB_UNAVAILABLE: 503,
  UNKNOWN: 500,
}

/* Wording follows the design's rule: say what happened, what the app did about
   it, and what the user can do next -- in that order. */
const SAFE_MESSAGE: Record<ErrorCode, string> = {
  VALIDATION_FAILED: 'That change was not valid. Nothing was saved.',
  UNAUTHENTICATED: 'Sign in to continue.',
  NOT_FOUND: 'That task no longer exists. It may have been deleted.',
  CONFLICT: 'That change conflicts with the current state. Nothing was saved.',
  DB_UNAVAILABLE:
    'Could not reach the database. Your change was rolled back — try again in a moment.',
  UNKNOWN:
    'Something failed on the server. Your change was rolled back — try again.',
}

function newErrorId(): string {
  return Math.random().toString(36).slice(2, 10)
}

/**
 * The trust boundary for errors. Anything thrown inside a server function goes
 * through here before it can reach a browser.
 *
 * A driver error can carry the connection string, cluster hostnames,
 * credentials and internal state in its message, `cause` chain and stack. None
 * of that may cross the wire (PLAN.md 4.7 vector 4), so unknown errors are
 * replaced wholesale with a fixed message rather than forwarded or trimmed.
 */
export function toSafeError(error: unknown): AppError {
  if (error instanceof AppError) return error

  const code = classify(error)
  // Deliberately discards the original message. Redacting a driver string is
  // guesswork; substituting a known-safe one is not.
  return new AppError(code, SAFE_MESSAGE[code], { cause: error })
}

function classify(error: unknown): ErrorCode {
  if (!(error instanceof Error)) return 'UNKNOWN'

  // Matched on the driver's own error class names, not on message text, which
  // varies between versions.
  const name = error.name
  if (
    name === 'MongoServerSelectionError' ||
    name === 'MongoNetworkError' ||
    name === 'MongoNetworkTimeoutError' ||
    name === 'MongoTopologyClosedError'
  ) {
    return 'DB_UNAVAILABLE'
  }
  if (name === 'MongoServerError' && 'code' in error && error.code === 11000) {
    return 'CONFLICT'
  }
  return 'UNKNOWN'
}
