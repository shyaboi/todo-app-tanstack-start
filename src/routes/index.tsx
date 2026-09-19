import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'

import { tasksQuery } from '~/features/tasks/task.query'
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
        <TaskList tasks={tasks} />
      )}
    </main>
  )
}
