import {
  createFileRoute,
  useLocation,
  useNavigate,
} from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Button } from '~/shared/components/Button'
import { tasksQuery } from '~/features/tasks/task.query'
import { TaskDetailPanel } from '~/features/tasks/components/TaskDetailPanel'
import styles from './_shell._list.t.$todoId.module.css'

/* Ephemeral intent that travels with a navigation but does not belong in the
   URL: "open this task, and put me in the due field". History state is the
   right home -- it is neither shareable nor persisted, which is exactly what a
   focus hint is. */
declare module '@tanstack/react-router' {
  interface HistoryState {
    focus?: 'dueAt'
  }
}

/* /t/$id: the detail panel, rendered into the list layout's outlet. The list
   above stays mounted -- that is the whole reason this is a child route and
   not a modal (PLAN.md 4.2).

   The id is matched against the cache, never sent anywhere from here, so it
   needs no validation: an id that is not a task is simply not found. */
export const Route = createFileRoute('/_shell/_list/t/$todoId')({
  component: TaskDetailRoute,
})

function TaskDetailRoute() {
  const { todoId } = Route.useParams()
  const navigate = useNavigate()
  const focus = useLocation({ select: (l) => l.state.focus })
  // The same cache the list reads; an optimistic edit shows here instantly.
  const { data: tasks = [] } = useQuery(tasksQuery)
  const task = tasks.find((t) => t.id === todoId)

  function close() {
    /* Focus goes back to the row FIRST: the row is still mounted (the list
       never left), so this needs no waiting on the navigation. Then the URL
       drops the panel, filters intact. */
    document
      .querySelector<HTMLElement>(`[data-task-row="${todoId}"]`)
      ?.focus({ preventScroll: true })
    void navigate({ to: '/', search: (prev) => prev })
  }

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
        <Button variant="secondary" size="small" onClick={close}>
          Back to the list
        </Button>
      </aside>
    )
  }

  return (
    <TaskDetailPanel
      key={task.id}
      task={task}
      onClose={close}
      initialFocus={focus}
    />
  )
}
