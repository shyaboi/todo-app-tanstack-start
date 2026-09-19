import { StatusPill, PriorityPill } from '~/shared/components/Pill'
import { isTempId } from '../task.query'
import { listName } from '../task.types'
import type { Task } from '../task.types'
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
  const pending = isTempId(task.id)
  const overdue = isOverdue(task)

  const className = [
    styles.row,
    task.status === 'done' && styles.done,
    pending && styles.pending,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <li className={className}>
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
        <StatusPill status={task.status} />

        {pending && <span className={styles.saving}>Saving…</span>}
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

/* Formatted with an explicit locale and timezone-free options so the server
   and the client produce the same string. Letting the runtime pick would give
   a hydration mismatch the moment CI and a browser disagree. */
const dueFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
})

function formatDue(iso: string): string {
  return dueFormat.format(new Date(iso))
}
