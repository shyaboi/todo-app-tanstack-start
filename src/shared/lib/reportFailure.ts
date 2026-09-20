import { describeError } from './describeError'
import { pushToast } from './toasts'

/**
 * The one way a failed write reaches the person (PLAN.md 7.1). Every mutation
 * hook calls this from its onError, after rolling the cache back, so the
 * notice always describes something the app has already undone -- which is
 * what lets its second clause ("your change was rolled back") be true.
 *
 * `retry` re-runs the same write with the same input. Left out where a retry
 * would need context the toast cannot carry.
 */
export function reportFailure(error: unknown, retry?: () => void): void {
  const report = describeError(error)
  pushToast({ message: report.message, errorId: report.errorId, retry })
}
