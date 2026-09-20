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

export function describeError(error: unknown): ErrorReport {
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
