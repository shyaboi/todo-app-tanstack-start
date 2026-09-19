import { useEffect, useState } from 'react'
import styles from './UndoToast.module.css'

const WINDOW_SECONDS = 8

/**
 * The design's 8-second undo. Destructive actions are always reversible for
 * long enough to change your mind.
 */
export function UndoToast({
  message,
  onUndo,
  onExpire,
}: {
  message: string
  onUndo: () => void
  onExpire: () => void
}) {
  const [remaining, setRemaining] = useState(WINDOW_SECONDS)

  /* No reset-on-change effect here: the caller passes key={undoToken}, so a
     second delete mounts a fresh toast with a fresh countdown. Resetting state
     from inside an effect renders once with a stale value first, which is what
     react-hooks/set-state-in-effect is warning about. */
  useEffect(() => {
    const tick = setInterval(() => {
      setRemaining((n) => (n > 0 ? n - 1 : 0))
    }, 1000)
    const expiry = setTimeout(onExpire, WINDOW_SECONDS * 1000)

    return () => {
      clearInterval(tick)
      clearTimeout(expiry)
    }
  }, [onExpire])

  return (
    // role="status" is polite: the deletion already happened, so this is a
    // report, not an interruption. The Undo button is reachable by Tab.
    <div className={styles.toast} role="status">
      <span className={styles.message}>{message}</span>
      <span className={styles.right}>
        <span className={styles.countdown} aria-hidden="true">
          {remaining}s
        </span>
        <button type="button" className={styles.undo} onClick={onUndo}>
          Undo
        </button>
      </span>
    </div>
  )
}
