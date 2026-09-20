/* What the client is allowed to say about a failure.

   The server already sanitises: every error that crosses the wire is an
   AppError payload with a code, a message written in the design's three-part
   order (what happened · what the app did · what to do next) and an id that
   matches a log line. This turns whatever actually arrived -- that payload, a
   network failure before any server was reached, or something unexpected --
   into one shape the UI can render without ever echoing a raw message it did
   not write itself. */

export interface ErrorReport {
  message: string
  errorId?: string
  code?: string
  /** True when the server was never reached: the write can simply be retried. */
  offline: boolean
}

const OFFLINE =
  'Could not reach the server. Nothing was saved — check your connection and try again.'
const UNKNOWN = 'Something failed. Your change was rolled back — try again.'

/* The tag the server appends so the code and the id survive serialisation,
   which drops everything but an Error's message (src/server/errors.ts). */
const WIRE_TAG = /\s*\[([A-Z_]+)#([a-z0-9]{4,16})\]$/

export function describeError(error: unknown): ErrorReport {
  /* A tagged message is one the server wrote on purpose: it went through
     toSafeError, so it names no host, no query and no credential. The tag
     itself never reaches the screen. */
  const tagged = readWireTag(error)
  if (tagged) return tagged

  if (isAppErrorLike(error)) {
    return {
      message: error.message,
      errorId: typeof error.errorId === 'string' ? error.errorId : undefined,
      code: error.code,
      offline: false,
    }
  }
  if (isNetworkFailure(error)) {
    return { message: OFFLINE, offline: true }
  }
  return { message: UNKNOWN, offline: false }
}

function readWireTag(error: unknown): ErrorReport | null {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' &&
          error !== null &&
          'message' in error &&
          typeof error.message === 'string'
        ? error.message
        : null
  if (!message) return null

  const match = WIRE_TAG.exec(message)
  if (!match) return null

  return {
    message: message.slice(0, match.index),
    code: match[1],
    errorId: match[2],
    offline: false,
  }
}

/* Duck-typed rather than instanceof: the class does not survive the wire, the
   shape does. A code is required -- a message alone could be anything. */
function isAppErrorLike(
  error: unknown,
): error is { code: string; message: string; errorId?: unknown } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message.length > 0
  )
}

/* fetch() rejects with a TypeError and no status when the request never
   completed. The message varies by browser ("Failed to fetch", "Load failed",
   "NetworkError when attempting to fetch resource"), so the type is the tell. */
function isNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError
}
