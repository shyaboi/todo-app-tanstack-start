import { useId, useState } from 'react'
import { PriorityPill } from '~/shared/components/Pill'
import { Button } from '~/shared/components/Button'
import { ConfirmDialog } from '~/shared/components/ConfirmDialog'
import { isTempId, useUpdateTask } from '../task.query'
import { listName } from '../task.types'
import type { Task, TaskStatus } from '../task.types'
import type { TaskGroup } from '../task.filters'
import { AdvanceStatusButton, DoneCheckbox } from './StatusControl'
import { InlineTitle } from './InlineTitle'
import styles from './TaskList.module.css'

/* A real list of real list items. Rows are not divs pretending to be buttons
   -- the design's accessibility contract says so explicitly, and it is what
   lets a screen reader announce "list, 10 items". */
export function TaskList({
  tasks,
  onDelete,
}: {
  tasks: Task[]
  /** Raised on confirm. The page owns the mutation, so it survives the row. */
  onDelete: (task: Task) => void
}) {
  return (
    <ul className={styles.list}>
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} onDelete={onDelete} />
      ))}
    </ul>
  )
}

function TaskRow({
  task,
  onDelete,
}: {
  task: Task
  onDelete: (task: Task) => void
}) {
  const update = useUpdateTask(task.id)
  const [confirming, setConfirming] = useState(false)

  // An optimistic row has no server id yet, so it cannot be changed or deleted.
  const creating = isTempId(task.id)
  const overdue = isOverdue(task)

  function setStatus(status: TaskStatus) {
    update.mutate({ id: task.id, patch: { status } })
  }

  const className = [
    styles.row,
    task.status === 'done' && styles.done,
    creating && styles.pending,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <li className={className}>
      <DoneCheckbox task={task} onChange={setStatus} disabled={creating} />

      <InlineTitle
        task={task}
        disabled={creating}
        onSave={(title) => update.mutate({ id: task.id, patch: { title } })}
      />

      <span className={styles.meta}>
        {task.listId && (
          <span className={styles.listName}>{listName(task.listId)}</span>
        )}

        {task.dueAt && (
          <time
            className={`${styles.due} ${overdue ? styles.overdue : ''}`}
            dateTime={task.dueAt}
          >
            {overdue ? 'Overdue · ' : ''}
            {formatDue(task.dueAt)}
          </time>
        )}

        <PriorityPill priority={task.priority} />
        <AdvanceStatusButton
          task={task}
          onChange={setStatus}
          disabled={creating}
        />

        {/* Item-level pending state, never a page spinner (system design 13). */}
        {(creating || update.isPending) && (
          <span className={styles.saving}>Saving…</span>
        )}

        <Button
          variant="ghost"
          size="small"
          iconOnly
          className={styles.rowAction}
          disabled={creating}
          // Destructive actions carry a clear accessible name that says WHAT
          // is being deleted -- "Delete" alone is ambiguous in a list.
          aria-label={`Delete "${task.title}"`}
          onClick={() => setConfirming(true)}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Button>
      </span>

      {/* Mounted only while open. A closed <dialog> still carries its text in
          the DOM, so rendering one per row would put every task title in the
          document twice and grow the tree with the list for no benefit. */}
      {confirming && (
        <ConfirmDialog
          title="Delete this task?"
          body={`"${task.title}" will be removed.`}
          note="You can undo for 8 seconds."
          confirmLabel="Delete"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false)
            onDelete(task)
          }}
        />
      )}
    </li>
  )
}

/* Compared against the START of today, not the current instant, for two
   reasons. The design treats Overdue and Today as separate groups, so a task
   due later today is not overdue. And a millisecond-precision comparison
   during render makes the server and the client disagree about a row's
   class -- a hydration mismatch (Failure Check 8). Date granularity is stable
   across both renders. */
function startOfToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function isOverdue(task: Task): boolean {
  if (!task.dueAt || task.status === 'done') return false
  return new Date(task.dueAt).getTime() < startOfToday()
}

/* Formatted with an explicit locale so the server and the client produce the
   same string. Letting the runtime pick would give a hydration mismatch the
   moment CI and a browser disagree. */
const dueFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
})

function formatDue(iso: string): string {
  return dueFormat.format(new Date(iso))
}

/* The design's list view: sections by due date, each with its own heading and
   count. One <ul> per group rather than one list with visual dividers, so a
   screen reader announces "Overdue, list, 1 item" and the count in the heading
   can never disagree with the rows -- both come from the same TaskGroup. */
export function TaskGroups({
  groups,
  onDelete,
  now,
}: {
  groups: TaskGroup[]
  onDelete: (task: Task) => void
  now: Date
}) {
  return (
    <div className={styles.groups}>
      {groups.map((group) => (
        <GroupSection
          key={group.key}
          group={group}
          onDelete={onDelete}
          now={now}
        />
      ))}
    </div>
  )
}

function GroupSection({
  group,
  onDelete,
  now,
}: {
  group: TaskGroup
  onDelete: (task: Task) => void
  now: Date
}) {
  const headingId = useId()
  return (
    <section className={styles.group} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.groupHeading}>
        {/* "Today · Fri 19 Sep", as the design labels it. */}
        {group.key === 'today'
          ? `Today · ${todayFormat.format(now)}`
          : group.label}
        <span className={styles.groupCount}>{group.tasks.length}</span>
      </h2>
      <TaskList tasks={group.tasks} onDelete={onDelete} />
    </section>
  )
}

// Locale pinned for the same reason as formatDue: the server and the client
// must produce the same string or hydration disagrees.
const todayFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})
