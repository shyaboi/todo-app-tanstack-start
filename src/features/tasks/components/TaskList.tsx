import { PriorityPill } from '~/shared/components/Pill'
import { isTempId, useUpdateTask } from '../task.query'
import { listName } from '../task.types'
import type { Task, TaskStatus } from '../task.types'
import { AdvanceStatusButton, DoneCheckbox } from './StatusControl'
import styles from './TaskList.module.css'

/* A real list of real list items. Rows are not divs pretending to be buttons
   -- the design's accessibility contract says so explicitly, and it is what
   lets a screen reader announce "list, 10 items". */
export function TaskList({ tasks }: { tasks: Task[] }) {
  return (
    <ul className={styles.list}>
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} />
      ))}
    </ul>
  )
}

function TaskRow({ task }: { task: Task }) {
  const update = useUpdateTask()

  // An optimistic row has no server id yet, so it cannot be updated.
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

      <span className={styles.title}>{task.title}</span>

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
      </span>
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
