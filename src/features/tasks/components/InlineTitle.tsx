import { useEffect, useRef, useState } from 'react'
import { titleSchema } from '../task.schema'
import type { Task } from '../task.types'
import styles from './InlineTitle.module.css'

/**
 * Click the title to edit it in place. Enter or blur saves, Escape reverts.
 *
 * The draft lives here rather than in the cache: an in-progress edit is
 * ephemeral component state, and losing it on reload is correct behaviour
 * (PLAN.md 4.1). Only a committed change reaches the server.
 */
export function InlineTitle({
  task,
  onSave,
  disabled,
}: {
  task: Task
  onSave: (title: string) => void
  disabled?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(task.title)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Guards against blur firing after Escape has already reverted.
  const cancelled = useRef(false)

  /* Focus is moved here rather than with the autoFocus prop. autoFocus is
     flagged by jsx-a11y because it steals focus on load; moving focus in
     response to a click the user just made is the opposite, and doing it
     imperatively keeps the rule meaningful instead of suppressed.
     Selecting the text makes retyping the common case cheap. */
  useEffect(() => {
    if (!editing) return
    const input = inputRef.current
    input?.focus()
    input?.select()
  }, [editing])

  function startEditing() {
    cancelled.current = false
    setDraft(task.title)
    setError(null)
    setEditing(true)
  }

  function commit() {
    if (cancelled.current) return

    // The same schema the server runs, so the form cannot accept something
    // the server would reject.
    const parsed = titleSchema.safeParse(draft)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'That title is not valid.')
      inputRef.current?.focus()
      return
    }

    setEditing(false)
    setError(null)
    // Nothing changed: skip the round trip entirely.
    if (parsed.data !== task.title) onSave(parsed.data)
  }

  function cancel() {
    cancelled.current = true
    setEditing(false)
    setError(null)
    setDraft(task.title)
  }

  if (!editing) {
    return (
      <span
        className={`${styles.wrap} ${task.status === 'done' ? styles.done : ''}`}
      >
        <button
          type="button"
          className={styles.trigger}
          disabled={disabled}
          // Says what activating it does; the title alone would read as a link.
          aria-label={`Edit title: ${task.title}`}
          onClick={startEditing}
        >
          {task.title}
        </button>
      </span>
    )
  }

  return (
    <span className={styles.wrap}>
      <input
        ref={inputRef}
        className={styles.input}
        value={draft}
        aria-label={`Title of "${task.title}"`}
        aria-invalid={error ? true : undefined}
        onChange={(e) => {
          setDraft(e.target.value)
          if (error) setError(null)
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            cancel()
          }
        }}
      />
      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
    </span>
  )
}
