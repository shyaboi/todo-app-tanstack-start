import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'

import { UndoToast } from '~/shared/components/UndoToast'
import { AccountBar } from '~/features/auth/components/AccountBar'
import { viewerQuery } from '~/features/auth/auth.query'
import {
  tasksQuery,
  useDeleteTask,
  useRestoreTask,
} from '~/features/tasks/task.query'
import type { PendingUndo } from '~/features/tasks/task.query'
import type { Task } from '~/features/tasks/task.types'
import {
  filterTasks,
  hasActiveFilters,
  sortTasks,
} from '~/features/tasks/task.filters'
import { parseTaskSearch, toFilters } from '~/features/tasks/task.search-params'
import { TaskList } from '~/features/tasks/components/TaskList'
import { TaskComposer } from '~/features/tasks/components/TaskComposer'
import styles from './index.module.css'

export const Route = createFileRoute('/')({
  /* The URL owns the filter state (PLAN.md 4.1, Failure Check 7). Validation
     falls back per field and never throws, so a bad link shows the unfiltered
     list rather than an error page. */
  validateSearch: parseTaskSearch,

  /* The router decides WHEN the data is needed; TanStack Query owns its
     lifecycle and cache. `ensureQueryData` populates the cache during SSR, and
     the component below reads from that same cache -- one source of truth,
     not a loader copy and a query copy (Failure Check 1).

     The list is loaded UNFILTERED regardless of the URL. Filtering is derived
     at render (D4): keying the query by filters would refetch on every
     keystroke and recreate the two-sources-of-truth problem. */
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(tasksQuery),
      context.queryClient.ensureQueryData(viewerQuery),
    ]),
  component: TasksPage,
})

function TasksPage() {
  // Already resolved by the loader, so this paints on the server with data.
  // No useEffect, no fetch waterfall.
  const { data: tasks = [] } = useQuery(tasksQuery)
  const search = Route.useSearch()
  const filters = toFilters(search)

  /* Derived, not stored: the canonical list is the cache, this is what the URL
     says to show from it. `now` is read once per render and only ever compared
     at day granularity inside the filters, so the server and the client agree
     unless a render straddles midnight -- which is the same trade-off the
     overdue styling already makes, for the same hydration reason. */
  const now = new Date()
  const visibleTasks = sortTasks(
    filterTasks(tasks, filters, now),
    filters.sort,
    filters.q,
  )
  const filtering = hasActiveFilters(filters)

  /* Ephemeral UI state, held locally rather than in a store: losing a pending
     undo on reload is the correct behaviour (PLAN.md 4.1). */
  const [undo, setUndo] = useState<PendingUndo | null>(null)
  const restore = useRestoreTask()
  const remove = useDeleteTask()

  const dismissUndo = () => setUndo(null)

  function onDelete(task: Task) {
    remove.mutate(task.id, {
      // The row's position travels with the undo, so restoring puts it back
      // where it was rather than at the end of the list.
      onSuccess: ({ undoToken }, _id, context) => {
        setUndo({ undoToken, task, index: context?.index ?? 0 })
      },
    })
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Tasker</h1>
        {/* Announced politely: a changed count is the answer to a filter change,
            and a screen reader user otherwise gets nothing back for it. */}
        <p className={styles.count} aria-live="polite">
          {countCopy(visibleTasks.length, tasks.length, filtering)}
        </p>
      </header>

      <AccountBar />

      <TaskComposer />

      {tasks.length === 0 ? (
        // First run. Not an error: there is simply nothing here yet.
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Nothing here yet</p>
          <p className={styles.emptyBody}>
            Add your first task above. Search, filters and the command palette
            arrive in Sprints 4 and 5.
          </p>
        </div>
      ) : visibleTasks.length === 0 ? (
        /* No matches. Distinct from first run on purpose: the tasks exist, the
           filters are hiding them, and the way out is to widen the filters. */
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>
            {filters.q ? `No tasks match “${filters.q}”` : 'No tasks match'}
          </p>
          <p className={styles.emptyBody}>
            Try a different word, or clear the filters.
          </p>
          <Link to="/" search={{}} className={styles.link}>
            Clear filters
          </Link>
        </div>
      ) : (
        <TaskList tasks={visibleTasks} onDelete={onDelete} />
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

function countCopy(visible: number, total: number, filtering: boolean): string {
  if (total === 0) return 'No tasks yet'
  const noun = (n: number) => (n === 1 ? 'task' : 'tasks')
  if (filtering) return `${visible} of ${total} ${noun(total)}`
  return `${total} ${noun(total)}`
}
