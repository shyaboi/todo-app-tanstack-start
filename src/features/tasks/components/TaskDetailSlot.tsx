import { useQuery } from '@tanstack/react-query'
import { Button } from '~/shared/components/Button'
import { tasksQuery } from '../task.query'
import { TaskDetailPanel } from './TaskDetailPanel'
import styles from './TaskDetailSlot.module.css'

/**
 * The detail, as a slot in whichever view you are in (PLAN.md 8.4b).
 *
 * The panel used to live only under the list layout, so opening a task from
 * the board navigated to `/t/$id` -- and the board vanished, replaced by the
 * list, with the panel beside it. That is not what opening a task means. The
 * detail belongs to the view you are looking at, so both `/t/$id` and
 * `/board/t/$id` render this, and it renders the same panel.
 *
 * One component, two slots. The routes differ only in where they send you
 * when it closes, and what they put focus back on.
 */
export function TaskDetailSlot({
  todoId,
  focus,
  missingAction,
  onClose,
}: {
  todoId: string
  focus?: 'dueAt'
  /** What the not-found state offers: "Back to the list", or to the board. */
  missingAction: string
  onClose: () => void
}) {
  // The same cache the view reads; an optimistic edit shows here instantly.
  const { data: tasks = [] } = useQuery(tasksQuery)
  const task = tasks.find((t) => t.id === todoId)

  if (!task) {
    // Deleted, undone, or never yours: all the same from here (§4.8).
    return (
      <aside className={styles.missing} aria-labelledby="task-missing-title">
        <h2 className={styles.missingTitle} id="task-missing-title">
          That task is not here
        </h2>
        <p className={styles.missingBody}>
          It may have been deleted, or the link may belong to someone else’s
          list.
        </p>
        <Button variant="secondary" size="small" onClick={onClose}>
          {missingAction}
        </Button>
      </aside>
    )
  }

  return (
    <TaskDetailPanel
      key={task.id}
      task={task}
      onClose={onClose}
      initialFocus={focus}
    />
  )
}
