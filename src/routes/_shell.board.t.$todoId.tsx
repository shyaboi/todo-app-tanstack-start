import {
  createFileRoute,
  useLocation,
  useNavigate,
} from '@tanstack/react-router'
import { TaskDetailSlot } from '~/features/tasks/components/TaskDetailSlot'

/* /board/t/$id: the same panel, in the board's own slot (PLAN.md 8.4b).
   Opening a card used to navigate to /t/$id, which lives under the list
   layout -- so the board disappeared and the list took its place behind the
   panel. The board stays mounted now, exactly as the list does. */
export const Route = createFileRoute('/_shell/board/t/$todoId')({
  component: BoardTaskDetailRoute,
})

function BoardTaskDetailRoute() {
  const { todoId } = Route.useParams()
  const navigate = useNavigate()
  const focus = useLocation({ select: (l) => l.state.focus })

  function close() {
    // Focus returns to the card, which never left the page.
    document
      .querySelector<HTMLElement>(`[data-task-card="${todoId}"]`)
      ?.focus({ preventScroll: true })
    void navigate({ to: '/board' })
  }

  return (
    <TaskDetailSlot
      todoId={todoId}
      focus={focus}
      missingAction="Back to the board"
      onClose={close}
    />
  )
}
