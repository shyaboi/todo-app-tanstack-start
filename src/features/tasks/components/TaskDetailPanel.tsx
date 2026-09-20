import { useEffect, useId, useRef, useState } from 'react'
import type { z } from 'zod'
import { Button } from '~/shared/components/Button'
import { Field } from '~/shared/components/Field'
import { Kbd } from '~/shared/components/Kbd'
import { isTempId, useUpdateTask } from '../task.query'
import { notesSchema, titleSchema } from '../task.schema'
import type { TaskPatchInput } from '../task.schema'
import { useQuery } from '@tanstack/react-query'
import { listsQuery } from '~/features/lists/list.query'
import { useEntering } from '~/shared/hooks/useEntering'
import {
  PRIORITIES,
  PRIORITY_LABEL,
  STATUS_LABEL,
  TASK_STATUSES,
  displayRef,
} from '../task.types'
import type { Priority, Task, TaskStatus } from '../task.types'
import styles from './TaskDetailPanel.module.css'

/** Fixed, so the D shortcut can land focus here from the list. */
export const DUE_INPUT_ID = 'task-detail-due'

type FieldName = 'title' | 'status' | 'dueAt' | 'priority' | 'listId' | 'notes'

/**
 * The detail panel: every field of one task, each saving on its own.
 *
 * There is no Save button and no form-wide state. A text field commits on
 * blur or Enter and reverts on Escape; a select commits the moment it changes.
 * Each commit is one PATCH of one field through the same `useUpdateTask` the
 * row uses -- scoped per task, so an edit here queues behind the row's own
 * in-flight edit rather than racing it (PLAN.md 4.5, Failure Check 6).
 *
 * Pending state is per field, never a panel-wide spinner (system design 13):
 * the field you just left says "Saving…", the others stay editable.
 *
 * Router-free by design. It takes a task and an onClose; the route decides
 * what closing means and where focus goes afterwards.
 */
export function TaskDetailPanel({
  task,
  onClose,
  initialFocus,
}: {
  task: Task
  onClose: () => void
  /** Where focus lands on open. Default is the panel itself. */
  initialFocus?: 'dueAt'
}) {
  const update = useUpdateTask(task.id)
  const { data: lists = [] } = useQuery(listsQuery)
  const panelRef = useRef<HTMLElement>(null)
  const headingId = useId()

  const [pending, setPending] = useState<FieldName | null>(null)
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({})
  const [savedAt, setSavedAt] = useState<number | null>(null)

  /* Focus enters the panel on open so a screen reader announces it and Escape
     has somewhere to work from; the route returns it to the row on close.
     The D shortcut asks for the due field directly. */
  useEffect(() => {
    if (initialFocus === 'dueAt') {
      document.getElementById(DUE_INPUT_ID)?.focus()
    } else {
      panelRef.current?.focus()
    }
  }, [initialFocus])

  function commit(field: FieldName, patch: TaskPatchInput) {
    setPending(field)
    setErrors((e) => ({ ...e, [field]: undefined }))
    update.mutate(
      { id: task.id, patch },
      {
        onSuccess: () => setSavedAt(Date.now()),
        // The hook has already rolled the cache back; the field keeps the
        // draft so the change can be retried with another blur.
        onError: () =>
          setErrors((e) => ({
            ...e,
            [field]: 'Could not save. Leave the field again to retry.',
          })),
        onSettled: () => setPending((p) => (p === field ? null : p)),
      },
    )
  }

  /* Escape inside a field: revert an unsaved draft; if there is nothing to
     revert, close the panel. The same two-step cascade as the search box.

     A native listener on the element, for two reasons. It runs BEFORE React
     dispatches the field's own handler, so `data-dirty` still says what the
     field looked like when the key went down -- the field reverts a moment
     later. And a region that responds to Escape is not a control pretending
     to be one, which is what the jsx-a11y rule against key handlers on
     non-interactive elements guards against; registering it here keeps that
     rule meaningful rather than suppressed. */
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // preventDefault so the page-level Escape cascade stays out of it.
      event.preventDefault()
      const target = event.target
      if (target instanceof HTMLElement && target.dataset.dirty === 'true') {
        return
      }
      onClose()
    }
    panel.addEventListener('keydown', onKeyDown)
    return () => panel.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const creating = isTempId(task.id)
  // A deep link to the panel loads with it already open: it is part of
  // the page then, not something that slid in (PLAN.md 4.6).
  const entering = useEntering()

  return (
    <aside
      ref={panelRef}
      className={styles.panel}
      data-enter={entering || undefined}
      aria-labelledby={headingId}
      tabIndex={-1}
      data-task-panel={task.id}
    >
      <header className={styles.header}>
        <p className={styles.ref}>{displayRef(task.id)}</p>
        <h2 className={styles.heading} id={headingId}>
          Task details
        </h2>
        <Button
          variant="ghost"
          size="small"
          iconOnly
          className={styles.close}
          aria-label="Close task details"
          title="Close · Esc"
          onClick={onClose}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6 6 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
            />
          </svg>
        </Button>
      </header>

      {creating && (
        <p className={styles.note}>
          Still saving this task; its fields unlock in a moment.
        </p>
      )}

      <TextField
        label="Title"
        value={task.title}
        schema={titleSchema}
        pending={pending === 'title'}
        error={errors.title}
        disabled={creating}
        onCommit={(title) => commit('title', { title })}
      />

      <Field
        select
        label="Status"
        value={task.status}
        disabled={creating || pending === 'status'}
        description={pending === 'status' ? 'Saving…' : undefined}
        error={errors.status}
        onChange={(e) =>
          commit('status', { status: e.target.value as TaskStatus })
        }
      >
        {TASK_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </Field>

      <DueField
        value={task.dueAt}
        pending={pending === 'dueAt'}
        error={errors.dueAt}
        disabled={creating}
        onCommit={(dueAt) => commit('dueAt', { dueAt })}
      />

      <Field
        select
        label="Priority"
        value={task.priority}
        disabled={creating || pending === 'priority'}
        description={pending === 'priority' ? 'Saving…' : undefined}
        error={errors.priority}
        onChange={(e) =>
          commit('priority', { priority: e.target.value as Priority })
        }
      >
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {PRIORITY_LABEL[p]}
          </option>
        ))}
      </Field>

      <Field
        select
        label="List"
        value={task.listId ?? ''}
        disabled={creating || pending === 'listId'}
        description={pending === 'listId' ? 'Saving…' : undefined}
        error={errors.listId}
        onChange={(e) =>
          commit('listId', {
            listId: e.target.value === '' ? null : e.target.value,
          })
        }
      >
        <option value="">No list</option>
        {lists.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </Field>

      <TextField
        label="Notes"
        multiline
        value={task.notes ?? ''}
        schema={notesSchema}
        pending={pending === 'notes'}
        error={errors.notes}
        disabled={creating}
        onCommit={(notes) =>
          commit('notes', { notes: notes === '' ? null : notes })
        }
      />

      <footer className={styles.footer}>
        <SavedAgo savedAt={savedAt} saving={pending !== null} />
        <span className={styles.hint} aria-hidden="true">
          <Kbd keys="esc" /> closes
        </span>
      </footer>
    </aside>
  )
}

/* One text field of the panel: a draft, commit on blur or Enter, revert on
   Escape, validated with the same schema the server runs. The draft is
   re-seeded from the task whenever the task changes underneath -- another
   tab, an undo -- unless this field is mid-edit, in which case the person
   typing wins. */
function TextField({
  label,
  value,
  schema,
  pending,
  error,
  disabled,
  multiline,
  onCommit,
}: {
  label: string
  value: string
  /** The same schema the server runs for this field. */
  schema: z.ZodType<string>
  pending: boolean
  error?: string
  disabled?: boolean
  multiline?: boolean
  onCommit: (value: string) => void
}) {
  const [draft, setDraft] = useState(value)
  const [seen, setSeen] = useState(value)
  const [invalid, setInvalid] = useState<string | null>(null)
  /* A failed save rolls the cache back, which arrives here as "the task
     changed underneath". That is the one change the draft must survive: it
     IS the value that failed, and the error text promises it can be retried. */
  if (value !== seen) {
    setSeen(value)
    if (draft === seen && !error) setDraft(value)
  }
  const dirty = draft !== value

  function commit() {
    if (!dirty) return
    const parsed = schema.safeParse(draft)
    if (!parsed.success) {
      setInvalid(parsed.error.issues[0]?.message ?? 'That is not valid.')
      return
    }
    setInvalid(null)
    onCommit(parsed.data)
  }

  function revert() {
    setDraft(value)
    setInvalid(null)
  }

  const common = {
    label,
    value: draft,
    disabled,
    'data-dirty': dirty ? 'true' : 'false',
    description: pending ? 'Saving…' : undefined,
    error: invalid ?? error,
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      setDraft(e.target.value)
      if (invalid) setInvalid(null)
    },
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Escape' && dirty) {
        // The panel's listener has already seen `data-dirty` and stood down.
        e.preventDefault()
        revert()
      } else if (e.key === 'Enter' && !multiline) {
        e.preventDefault()
        commit()
      }
    },
  }

  return multiline ? <Field multiline {...common} /> : <Field {...common} />
}

/* The due date, as a datetime-local input. The stored value is an exact ISO
   instant (the design's contract); the control speaks local wall-clock time,
   so the conversion happens at the edges and nowhere else. Natural-language
   dates ("tomorrow 4pm") arrive with the composer parser in 6.3. */
function DueField({
  value,
  pending,
  error,
  disabled,
  onCommit,
}: {
  value: string | null
  pending: boolean
  error?: string
  disabled?: boolean
  onCommit: (iso: string | null) => void
}) {
  const local = value ? toLocalInput(value) : ''
  const [draft, setDraft] = useState(local)
  const [seen, setSeen] = useState(local)
  const [invalid, setInvalid] = useState<string | null>(null)
  // Same rule as the text fields: a rolled-back save keeps the draft.
  if (local !== seen) {
    setSeen(local)
    if (draft === seen && !error) setDraft(local)
  }
  const dirty = draft !== local

  function commit() {
    if (!dirty) return
    if (draft === '') {
      setInvalid(null)
      onCommit(null)
      return
    }
    const instant = new Date(draft)
    if (Number.isNaN(instant.getTime())) {
      setInvalid('Enter a date and time, or clear the field.')
      return
    }
    setInvalid(null)
    onCommit(instant.toISOString())
  }

  return (
    <Field
      id={DUE_INPUT_ID}
      type="datetime-local"
      label="Due"
      value={draft}
      disabled={disabled}
      data-dirty={dirty ? 'true' : 'false'}
      description={pending ? 'Saving…' : 'Leave empty for no due date.'}
      error={invalid ?? error}
      onChange={(e) => {
        setDraft(e.target.value)
        if (invalid) setInvalid(null)
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && dirty) {
          e.preventDefault()
          setDraft(local)
          setInvalid(null)
        } else if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        }
      }}
    />
  )
}

/** "2026-09-15T16:00" in the browser's zone, which is what the control reads. */
function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/* "Saved 2s ago", ticking. Announced politely: a save outcome is the answer
   to leaving a field, and a screen reader user otherwise gets nothing back.
   The clock only runs while there is something to count from, and it is read
   inside the interval rather than during render, so the server -- which never
   has a savedAt -- and the client agree on the first paint. */
function SavedAgo({
  savedAt,
  saving,
}: {
  savedAt: number | null
  saving: boolean
}) {
  const [ago, setAgo] = useState<number | null>(null)

  useEffect(() => {
    if (savedAt === null) return
    const tick = () =>
      setAgo(Math.max(0, Math.round((Date.now() - savedAt) / 1000)))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [savedAt])

  let text = ''
  if (saving) text = 'Saving…'
  else if (ago !== null) {
    text =
      ago < 2
        ? 'Saved just now'
        : ago < 60
          ? `Saved ${ago}s ago`
          : `Saved ${Math.round(ago / 60)}m ago`
  }

  return (
    <p className={styles.saved} aria-live="polite">
      {text}
    </p>
  )
}
