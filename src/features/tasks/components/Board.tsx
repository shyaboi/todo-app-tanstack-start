import { PriorityPill } from '~/shared/components/Pill'
import { STATUS_LABEL, TASK_STATUSES, listName } from '../task.types'
import type { Task, TaskStatus } from '../task.types'
import { isTempId } from '../task.query'
import styles from './Board.module.css'

/**
 * Everything a card needs from the page. Selection and the lifted card are
 * page-owned, because the keyboard and the pointer both drive them and must
 * agree (PLAN.md 4.5).
 */
export interface BoardControls {
  selectedId: string | null
  liftedId: string | null
  onSelect: (id: string) => void
  onOpen: (task: Task) => void
  onToggleLift: (task: Task) => void
}

export interface Column {
  status: TaskStatus
  tasks: Task[]
}

/** Tasks by status, in column order, never dropping one. */
export function toColumns(tasks: readonly Task[]): Column[] {
  return TASK_STATUSES.map((status) => ({
    status,
    tasks: tasks.filter((t) => t.status === status),
  }))
}

/* Three columns, each a real list. Status is never colour alone: every
   column carries its heading and its dot, and every card names its column in
   its accessible label, so a card read out of context still says where it
   is (FE design "Board", PLAN.md 4.6). */
export function Board({
  columns,
  controls,
}: {
  columns: Column[]
  controls: BoardControls
}) {
  return (
    <div className={styles.board}>
      {columns.map((column) => (
        <section
          key={column.status}
          className={`${styles.column} ${styles[column.status] ?? ''}`}
          aria-labelledby={`board-${column.status}`}
          data-board-column={column.status}
        >
          <h2 className={styles.heading} id={`board-${column.status}`}>
            <span className={styles.dot} aria-hidden="true" />
            {STATUS_LABEL[column.status]}
            <span className={styles.count}>{column.tasks.length}</span>
          </h2>
          {column.tasks.length === 0 ? (
            <p className={styles.empty}>Nothing here</p>
          ) : (
            <ul className={styles.cards}>
              {column.tasks.map((task) => (
                <BoardCard key={task.id} task={task} controls={controls} />
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}

function BoardCard({
  task,
  controls,
}: {
  task: Task
  controls: BoardControls
}) {
  const selected = controls.selectedId === task.id
  const lifted = controls.liftedId === task.id
  const creating = isTempId(task.id)

  const className = [
    styles.card,
    selected && styles.selected,
    lifted && styles.lifted,
    creating && styles.pending,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    /* Roving focus, as on the list: arrows move real DOM focus here, so the
       selected card is the one that has focus and a screen reader follows.
       aria-grabbed is deprecated in ARIA 1.1 with no replacement, so the
       lifted state is carried by aria-pressed on the lift button and by the
       card's label instead. */
    <li
      className={className}
      tabIndex={-1}
      data-task-card={task.id}
      aria-current={selected ? 'true' : undefined}
      aria-label={`${task.title}, ${STATUS_LABEL[task.status]}${lifted ? ', picked up' : ''}`}
      onFocus={() => controls.onSelect(task.id)}
    >
      <button
        type="button"
        className={styles.title}
        disabled={creating}
        aria-label={`Open "${task.title}"`}
        title="Open · ↵"
        onClick={() => controls.onOpen(task)}
      >
        {task.title}
      </button>

      <div className={styles.meta}>
        {task.listId && (
          <span className={styles.listName}>{listName(task.listId)}</span>
        )}
        {task.dueAt && (
          <time className={styles.due} dateTime={task.dueAt}>
            {dueFormat.format(new Date(task.dueAt))}
          </time>
        )}
        <PriorityPill priority={task.priority} />
        <button
          type="button"
          className={styles.lift}
          disabled={creating}
          aria-pressed={lifted}
          aria-label={
            lifted ? `Drop "${task.title}"` : `Pick up "${task.title}"`
          }
          title={lifted ? 'Drop · Space' : 'Pick up · Space'}
          onClick={() => controls.onToggleLift(task)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </li>
  )
}

/* Explicit locale, as everywhere a date is rendered: server and client must
   produce the same string or hydration disagrees (Failure Check 8). */
const dueFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
})
