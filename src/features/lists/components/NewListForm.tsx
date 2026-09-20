import { useId, useState } from 'react'
import { listNameSchema } from '../list.schema'
import { useCreateList } from '../list.query'
import styles from './NewListForm.module.css'

/**
 * "New list", inline in the sidebar. A real form: Enter submits, the label is
 * real, the error is announced. The list appears optimistically and the
 * field clears at once, the same contract as the task composer.
 */
export function NewListForm() {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const id = useId()
  const create = useCreateList()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const parsed = listNameSchema.safeParse(name)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'That name is not valid.')
      return
    }
    setError(null)
    create.mutate({ name: parsed.data })
    setName('')
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">+</span> New list
      </button>
    )
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <label className="visually-hidden" htmlFor={id}>
        New list name
      </label>
      <input
        id={id}
        className={styles.input}
        value={name}
        placeholder="List name"
        maxLength={40}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        // Moved here in response to the click, not on load.
        ref={(el) => el?.focus()}
        onChange={(e) => {
          setName(e.target.value)
          if (error) setError(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            setOpen(false)
            setName('')
            setError(null)
          }
        }}
      />
      <div className={styles.actions}>
        <button type="submit" className={styles.add}>
          Add
        </button>
        <button
          type="button"
          className={styles.cancel}
          onClick={() => {
            setOpen(false)
            setName('')
            setError(null)
          }}
        >
          Cancel
        </button>
      </div>
      {error && (
        <p className={styles.error} id={`${id}-err`} role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
