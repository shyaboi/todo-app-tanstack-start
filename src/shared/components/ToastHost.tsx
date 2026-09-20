import { useState } from 'react'
import { dismissToast, useToasts } from '../lib/toasts'
import type { Toast } from '../lib/toasts'
import styles from './ToastHost.module.css'

/**
 * Where failures land. Mounted once, at the root, so a write that fails on
 * any page is reported the same way with the same two actions the design
 * mandates: Retry, and Copy error id (system design 12, 13).
 *
 * Never a bare "Something went wrong": the message is the server's own, in
 * the order what happened · what the app did · what you can do next.
 */
export function ToastHost() {
  const toasts = useToasts()
  if (toasts.length === 0) return null
  return (
    <div className={styles.host}>
      {toasts.map((toast) => (
        <FailureToast key={toast.id} toast={toast} />
      ))}
    </div>
  )
}

function FailureToast({ toast }: { toast: Toast }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    if (!toast.errorId) return
    try {
      await navigator.clipboard.writeText(toast.errorId)
      setCopied(true)
    } catch {
      // No clipboard access: the id is printed right there to read out.
    }
  }

  return (
    /* role="alert": a failed write is an interruption, not a status update,
       and is announced at once. The controls are ordinary buttons after the
       message, reachable by Tab. */
    <div className={styles.toast} role="alert">
      <p className={styles.message}>{toast.message}</p>
      <div className={styles.actions}>
        {toast.retry && (
          <button
            type="button"
            className={`${styles.action} ${styles.primary}`}
            onClick={() => {
              toast.retry?.()
              dismissToast(toast.id)
            }}
          >
            Retry
          </button>
        )}
        {toast.errorId && (
          <button
            type="button"
            className={styles.action}
            onClick={() => void copy()}
          >
            {copied ? 'Copied' : 'Copy error id'}
          </button>
        )}
        <button
          type="button"
          className={styles.action}
          aria-label="Dismiss"
          onClick={() => dismissToast(toast.id)}
        >
          ✕
        </button>
      </div>
      {toast.errorId && (
        <p className={styles.errorId}>
          Error id <code>{toast.errorId}</code> — quote it when reporting this.
        </p>
      )}
    </div>
  )
}
