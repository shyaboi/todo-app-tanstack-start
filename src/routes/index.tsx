import { useCallback, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'

import { UndoToast } from '~/shared/components/UndoToast'
import {
  tasksQuery,
  useDeleteTask,
  useRestoreTask,
} from '~/features/tasks/task.query'
import type { PendingUndo } from '~/features/tasks/task.query'
import type { Task } from '~/features/tasks/task.types'
import { TaskList } from '~/features/tasks/components/TaskList'
import { TaskComposer } from '~/features/tasks/components/TaskComposer'
import styles from './index.module.css'

export const Route = createFileRoute('/')({
  /* The router decides WHEN the data is needed; TanStack Query owns its
     lifecycle and cache. `ensureQueryData` populates the cache during SSR, and
     the component below reads from that same cache -- one source of truth,
     not a loader copy and a query copy (Failure Check 1). */
  loader: ({ context }) => context.queryClient.ensureQueryData(tasksQuery),
  component: TasksPage,
})

function TasksPage() {
  // Already resolved by the loader, so this paints on the server with data.
  // No useEffect, no fetch waterfall.
  const { data: tasks = [] } = useQuery(tasksQuery)

  /* Ephemeral UI state, held locally rather than in a store: losing a pending
     undo on reload is the correct behaviour (PLAN.md 4.1). */
  const [undo, setUndo] = useState<PendingUndo | null>(null)
  const restore = useRestoreTask()
  const remove = useDeleteTask()

  const dismissUndo = useCallback(() => setUndo(null), [])

  const onDelete = useCallback(
    (task: Task) => {
      remove.mutate(task.id, {
        // The row's position travels with the undo, so restoring puts it back
        // where it was rather than at the end of the list.
        onSuccess: ({ undoToken }, _id, context) => {
          setUndo({ undoToken, task, index: context?.index ?? 0 })
        },
      })
    },
    [remove],
  )

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Tasker</h1>
        <p className={styles.count}>
          {tasks.length === 0
            ? 'No tasks yet'
            : `${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`}
        </p>
      </header>

      <TaskComposer />

      {tasks.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Nothing here yet</p>
          <p className={styles.emptyBody}>
            Add your first task above. Search, filters and the command palette
            arrive in Sprints 3 and 4.
          </p>
        </div>
      ) : (
        <TaskList tasks={tasks} onDelete={onDelete} />
      )}

      {undo && (
        <UndoToast
          // A fresh toast per delete, so the countdown restarts without
          // resetting state from inside an effect.
          key={undo.undoToken}
          message="Task deleted"
          onExpire={dismissUndo}
          onUndo={() => {
            restore.mutate(undo)
            setUndo(null)
          }}
        />
      )}
    </main>
  )
}
