import type { ReactNode } from 'react'
import styles from './Pill.module.css'

export type TaskStatus = 'todo' | 'doing' | 'done'
export type Priority = 'p1' | 'p2' | 'p3'

/* Display labels live here, beside the wire values, so the rest of the app
   never has to guess how a status is spelled to a person.
   Wire format is todo/doing/done (PLAN.md D2); these are what is read. */
export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To do',
  doing: 'In progress',
  done: 'Done',
}

export function StatusPill({ status }: { status: TaskStatus }) {
  return (
    <span className={`${styles.pill} ${styles[status]}`}>
      {/* The dot is decoration; the label is the information. */}
      <span className={styles.dot} aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  )
}

export function PriorityPill({ priority }: { priority: Priority }) {
  return (
    <span
      className={`${styles.pill} ${styles.priority} ${priority === 'p1' ? styles.p1 : ''}`}
    >
      {priority.toUpperCase()}
    </span>
  )
}

export function Chip({
  children,
  variant = 'neutral',
}: {
  children: ReactNode
  variant?: 'neutral' | 'outline'
}) {
  return <span className={`${styles.pill} ${styles[variant]}`}>{children}</span>
}
