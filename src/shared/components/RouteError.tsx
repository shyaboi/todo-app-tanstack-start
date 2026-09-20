import { useState } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { Button } from './Button'
import { describeError } from '../lib/describeError'
import styles from './RouteError.module.css'

/**
 * What a route shows when its loader fails (PLAN.md 7.1). Never the bare
 * "Something went wrong" the router falls back to: the message is the
 * server's own, the id matches its log line, and there are two ways out --
 * try the load again, or go somewhere that works.
 *
 * `reset` clears the boundary; `invalidate` re-runs the loaders. Both, so a
 * retry is a real second attempt and not a re-render of the same failure.
 */
export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  const report = describeError(error)
  const [copied, setCopied] = useState(false)

  async function copy() {
    if (!report.errorId) return
    try {
      await navigator.clipboard.writeText(report.errorId)
      setCopied(true)
    } catch {
      // The id is printed right there.
    }
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>This page could not load</h1>
      {/* role="alert": the failure is why the page is empty, and is said first. */}
      <p className={styles.body} role="alert">
        {report.message}
      </p>
      <div className={styles.actions}>
        <Button
          variant="primary"
          onClick={() => {
            reset()
            void router.invalidate()
          }}
        >
          Try again
        </Button>
        <Link to="/" search={{}} className={styles.link}>
          Back to your tasks
        </Link>
      </div>
      {report.errorId && (
        <p className={styles.errorId}>
          Error id <code>{report.errorId}</code>
          <button
            type="button"
            className={styles.copy}
            onClick={() => void copy()}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </p>
      )}
    </main>
  )
}
