import { useState } from 'react'
import { PriorityPill } from '~/shared/components/Pill'
import { useQuery } from '@tanstack/react-query'
import { listsQuery } from '~/features/lists/list.query'
import { listName } from '~/features/lists/list.types'
import { STATUS_LABEL, TASK_STATUSES } from '../task.types'
import type { Task, TaskStatus } from '../task.types'
import { isTempId } from '../task.query'
import styles from './Board.module.css'

/**
 * Everything a card needs from the page. Selection, the lifted card and the
 * dragged card are page-owned, because the keyboard and the pointer both
 * drive them and must agree (PLAN.md 4.5).
 */
export interface BoardControls {
  selectedId: string | null
  liftedId: string | null
  draggingId: string | null
  onSelect: (id: string) => void
  onOpen: (task: Task) => void
  onToggleLift: (task: Task) => void
  onDragStart: (task: Task) => void
  onDragEnd: () => void
  /** A drop is a status change -- the same one ⇧→ makes (D11). */
  onDrop: (taskId: string, status: TaskStatus) => void
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
        <BoardColumn key={column.status} column={column} controls={controls} />
      ))}
    </div>
  )
}

/* A column is also a drop target. Pointer drag-and-drop arrived after the
   keyboard path and dispatches into the same status change, so it adds a
   second way to move a card and not a second implementation of moving one.
   Whether a drag is over this column is the only state a column owns. */
function BoardColumn({
  column,
  controls,
}: {
  column: Column
  controls: BoardControls
}) {
  const [over, setOver] = useState(false)
  const label = STATUS_LABEL[column.status]

  return (
    <section
      className={[
        styles.column,
        styles[column.status] ?? '',
        over && styles.dropTarget,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-labelledby={`board-${column.status}`}
      data-board-column={column.status}
      onDragOver={(event) => {
        if (!controls.draggingId) return
        // preventDefault is what makes the column a valid drop target.
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        if (!over) setOver(true)
      }}
      onDragLeave={(event) => {
        // Leaving a child of the column is not leaving the column.
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
          return
        }
        setOver(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setOver(false)
        const id =
          event.dataTransfer.getData('text/plain') || controls.draggingId
        if (id) controls.onDrop(id, column.status)
      }}
    >
      <h2 className={styles.heading} id={`board-${column.status}`}>
        <span className={styles.dot} aria-hidden="true" />
        {label}
        <span className={styles.count}>{column.tasks.length}</span>
      </h2>
      {over && (
        <p className={styles.dropHint} aria-hidden="true">
          Drop here to set status → {label}
        </p>
      )}
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
  )
}

function BoardCard({
  task,
  controls,
}: {
  task: Task
  controls: BoardControls
}) {
  const { data: lists = [] } = useQuery(listsQuery)
  const selected = controls.selectedId === task.id
  const lifted = controls.liftedId === task.id
  const dragging = controls.draggingId === task.id
  const creating = isTempId(task.id)

  const className = [
    styles.card,
    selected && styles.selected,
    lifted && styles.lifted,
    dragging && styles.dragging,
    creating && styles.pending,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    /* Roving focus, as on the list: arrows move real DOM focus here, so the
       selected card is the one that has focus and a screen reader follows.
       aria-grabbed is deprecated in ARIA 1.1 with no replacement, so the
       lifted state is carried by aria-pressed on the lift button and by the
       card's label instead. Draggable, too -- the pointer's way of doing what
       Space and the arrows do. */
    <li
      className={className}
      tabIndex={-1}
      data-task-card={task.id}
      aria-current={selected ? 'true' : undefined}
      aria-label={`${task.title}, ${STATUS_LABEL[task.status]}${lifted ? ', picked up' : ''}`}
      draggable={!creating}
      onFocus={() => controls.onSelect(task.id)}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', task.id)
        event.dataTransfer.effectAllowed = 'move'
        controls.onDragStart(task)
      }}
      onDragEnd={() => controls.onDragEnd()}
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
          <span className={styles.listName}>
            {listName(lists, task.listId)}
          </span>
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
          title={lifted ? 'Drop · Space' : 'Pick up · Space, or drag'}
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
