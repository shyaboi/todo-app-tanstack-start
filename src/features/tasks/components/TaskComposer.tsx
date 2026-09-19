import { useId, useRef, useState } from 'react'
import { Button } from '~/shared/components/Button'
import { Kbd } from '~/shared/components/Kbd'
import { useCreateTask } from '../task.query'
import { titleSchema } from '../task.schema'
import styles from './TaskComposer.module.css'

export function TaskComposer() {
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const labelId = useId()

  const create = useCreateTask()

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()

    /* The same schema the server function runs. Validating here is a courtesy
       to the user, not a security measure -- the server validates regardless
       (Failure Check 4). */
    const parsed = titleSchema.safeParse(title)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'That title is not valid.')
      inputRef.current?.focus()
      return
    }

    setError(null)
    create.mutate(
      { title: parsed.data },
      {
        onSuccess: () => setTitle(''),
        onError: (err: unknown) =>
          setError(
            err instanceof Error
              ? err.message
              : 'Could not save that. Try again.',
          ),
      },
    )
    // Cleared optimistically so the next task can be typed immediately; the
    // error path puts the text back.
    setTitle('')
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <div className={styles.bar}>
        {/* A real label, visually hidden: the placeholder is not a label. */}
        <label
          className="visually-hidden"
          htmlFor={labelId}
          id={`${labelId}-label`}
        >
          Task title
        </label>
        <input
          id={labelId}
          ref={inputRef}
          className={styles.input}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            if (error) setError(null)
          }}
          placeholder="Add a task…"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${labelId}-err` : undefined}
          autoComplete="off"
        />
        <Kbd keys="N" />
        <Button type="submit" variant="primary" loading={create.isPending}>
          Add task
        </Button>
      </div>

      {error && (
        <p className={styles.error} id={`${labelId}-err`} role="alert">
          <span className={styles.dot} aria-hidden="true" />
          {error}
        </p>
      )}
    </form>
  )
}
