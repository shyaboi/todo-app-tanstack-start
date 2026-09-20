import {
  createFileRoute,
  useLocation,
  useNavigate,
} from '@tanstack/react-router'
import { TaskDetailSlot } from '~/features/tasks/components/TaskDetailSlot'

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
   not a modal (PLAN.md 4.2). The board has its own slot at /board/t/$id
   (8.4b); the panel itself is the same component in both.

   The id is matched against the cache, never sent anywhere from here, so it
   needs no validation: an id that is not a task is simply not found. */
export const Route = createFileRoute('/_shell/_list/t/$todoId')({
  component: TaskDetailRoute,
})

function TaskDetailRoute() {
  const { todoId } = Route.useParams()
  const navigate = useNavigate()
  const focus = useLocation({ select: (l) => l.state.focus })

  function close() {
    /* Focus goes back to the row FIRST: the row is still mounted (the list
       never left), so this needs no waiting on the navigation. Then the URL
       drops the panel, filters intact. */
    document
      .querySelector<HTMLElement>(`[data-task-row="${todoId}"]`)
      ?.focus({ preventScroll: true })
    void navigate({ to: '/', search: (prev) => prev })
  }

  return (
    <TaskDetailSlot
      todoId={todoId}
      focus={focus}
      missingAction="Back to the list"
      onClose={close}
    />
  )
}
