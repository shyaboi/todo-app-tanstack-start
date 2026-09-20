import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'

import { Button } from '~/shared/components/Button'
import { UndoToast } from '~/shared/components/UndoToast'
import { useSelection } from '~/shared/hooks/useSelection'
import { useShortcuts } from '~/shared/hooks/useShortcuts'
import { AccountBar } from '~/features/auth/components/AccountBar'
import { viewerQuery } from '~/features/auth/auth.query'
import {
  tasksQuery,
  useCreateTask,
  useDeleteTask,
  useRestoreTask,
  useUpdateTask,
} from '~/features/tasks/task.query'
import type { PendingUndo } from '~/features/tasks/task.query'
import type { Task, TaskStatus } from '~/features/tasks/task.types'
import {
  countByStatus,
  filterTasks,
  groupByDue,
  hasActiveFilters,
  hiddenByStatus,
  sortTasks,
} from '~/features/tasks/task.filters'
import type { SortOrder } from '~/features/tasks/task.filters'
import { parseTaskSearch, toFilters } from '~/features/tasks/task.search-params'
import type { TaskSearch } from '~/features/tasks/task.search-params'
import { buildTaskCommands } from '~/features/tasks/task.commands'
import { TaskGroups, TaskList } from '~/features/tasks/components/TaskList'
import type { RowControls } from '~/features/tasks/components/TaskList'
import {
  COMPOSER_INPUT_ID,
  TaskComposer,
} from '~/features/tasks/components/TaskComposer'
import {
  SEARCH_INPUT_ID,
  SearchInput,
} from '~/features/tasks/components/SearchInput'
import { SortSelect } from '~/features/tasks/components/SortSelect'
import { TaskFilters } from '~/features/tasks/components/TaskFilters'
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

/** The design's list view sorts by due date and groups by it. */
const DEFAULT_SORT: SortOrder = 'due'

function TasksPage() {
  // Already resolved by the loader, so this paints on the server with data.
  // No useEffect, no fetch waterfall.
  const { data: tasks = [] } = useQuery(tasksQuery)
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const filters = toFilters(search)

  /* Every filter change is a navigation, so the URL stays the one owner.
     Clicking a chip PUSHES: a chosen filter is a place you can go back from.
     Typing is different. The design says a query is state, not a route change,
     and Back should return to the unfiltered list rather than step through
     every keystroke -- so a search PUSHES once when it starts and REPLACES
     while it is refined or cleared. One history entry per search, not one per
     keystroke, and not zero: replacing from the very first keystroke would
     overwrite the entry you came from and leave nothing to go back to. */
  function updateSearch(patch: Partial<TaskSearch>, replace = false) {
    void navigate({
      search: (prev) => {
        const next: TaskSearch = { ...prev, ...patch }
        // A cleared filter leaves the URL entirely rather than lingering as `?q=`.
        for (const key of Object.keys(next) as (keyof TaskSearch)[]) {
          if (next[key] === undefined) delete next[key]
        }
        return next
      },
      replace,
    })
  }

  /** "Go to" arrives somewhere: the whole search is replaced, not patched. */
  function goTo(next: TaskSearch) {
    void navigate({ search: next })
  }

  /* Derived, not stored: the canonical list is the cache, this is what the URL
     says to show from it. `now` is read once per render and only ever compared
     at day granularity inside the filters, so the server and the client agree
     unless a render straddles midnight -- which is the same trade-off the
     overdue styling already makes, for the same hydration reason. */
  const now = new Date()
  const sort = filters.sort ?? DEFAULT_SORT
  const visibleTasks = sortTasks(
    filterTasks(tasks, filters, now),
    sort,
    filters.q,
  )
  // Due-date order is the grouped view; the other orders are a ranked flat list.
  const groups = sort === 'due' ? groupByDue(visibleTasks, now) : null
  const filtering = hasActiveFilters(filters)

  /* The keyboard walks the list in the order it is DRAWN, which in the grouped
     view is group by group -- not the flat sort the groups were cut from. */
  const ordered = groups ? groups.flatMap((g) => g.tasks) : visibleTasks
  const selection = useSelection(ordered.map((t) => t.id))
  const selected = ordered.find((t) => t.id === selection.selectedId) ?? null

  /* Ephemeral UI state, held locally rather than in a store (PLAN.md 4.1).
     The edit in progress and the pending delete live here, not in the row,
     because a click and a shortcut can each start them and must agree. */
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [undo, setUndo] = useState<PendingUndo | null>(null)

  const restore = useRestoreTask()
  const remove = useDeleteTask()
  const create = useCreateTask()
  // Scoped to whichever task is selected, so a shortcut edit queues behind
  // the row's own in-flight edit of the same task rather than racing it.
  const updateSelected = useUpdateTask(selection.selectedId ?? 'none')

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

  function setStatus(task: Task, status: TaskStatus) {
    updateSelected.mutate({ id: task.id, patch: { status } })
  }

  /* One registry feeds the shortcuts now and the palette in 5.2. Every entry
     dispatches into the same mutation or navigation the visible control uses,
     so there is exactly one implementation of each behaviour (PLAN.md 4.5). */
  const commands = buildTaskCommands({
    selected,
    search,
    updateSearch: (patch) => updateSearch(patch),
    goTo,
    setStatus,
    startEdit: (task) => setEditingId(task.id),
    requestDelete: (task) => setConfirmingId(task.id),
    duplicate: (task) =>
      create.mutate({
        title: task.title,
        notes: task.notes,
        priority: task.priority,
        listId: task.listId,
        dueAt: task.dueAt,
        status: 'todo',
      }),
    moveSelection: selection.move,
    escape: () => {
      // Dialogs and text fields handle their own Escape before this runs
      // (design rule: close a panel, then clear search, then drop selection).
      if (search.q) {
        updateSearch({ q: undefined }, true)
      } else if (selection.selectedId) {
        selection.clear()
        const active = document.activeElement
        if (
          active instanceof HTMLElement &&
          active.closest('[data-task-row]')
        ) {
          active.blur()
        }
      }
    },
    /* By id rather than by ref: these closures are created during render and
       handed to the registry, and a ref read inside one cannot be proven by the
       compiler to happen later. An id has no such ambiguity, and there is one
       of each control on the page. */
    focusComposer: () => document.getElementById(COMPOSER_INPUT_ID)?.focus(),
    focusSearch: () => {
      const box = document.getElementById(SEARCH_INPUT_ID)
      if (box instanceof HTMLInputElement) {
        box.focus()
        box.select()
      }
    },
  })
  useShortcuts(commands, selected !== null)

  const controls: RowControls = {
    selectedId: selection.selectedId,
    editingId,
    confirmingId,
    onSelect: selection.select,
    onEditingChange: (id, editing) => setEditingId(editing ? id : null),
    onConfirmingChange: (id, confirming) =>
      setConfirmingId(confirming ? id : null),
    onDelete,
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

      <div className={styles.toolbar}>
        <SearchInput
          value={search.q ?? ''}
          onChange={(q) =>
            updateSearch({ q: q || undefined }, search.q !== undefined)
          }
        />
        <SortSelect
          value={sort}
          // The default never needs to appear in the URL.
          onChange={(next) =>
            updateSearch({ sort: next === DEFAULT_SORT ? undefined : next })
          }
        />
      </div>

      {tasks.length > 0 && (
        <TaskFilters
          search={search}
          counts={countByStatus(tasks)}
          total={tasks.length}
          hidden={hiddenByStatus(tasks, filters, now)}
          onChange={(patch) => updateSearch(patch)}
        />
      )}

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
        <NoMatches
          filters={filters}
          pending={create.isPending}
          onCreate={(title) => create.mutate({ title })}
        />
      ) : groups ? (
        <TaskGroups groups={groups} controls={controls} now={now} />
      ) : (
        <TaskList tasks={visibleTasks} controls={controls} />
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

/* The second empty state, kept distinct from first run on purpose (system
   design 12): the tasks exist and the filters are hiding them, so the copy
   says how many filters are doing the hiding and offers two ways out --
   widen them, or make the task you were evidently looking for. */
function NoMatches({
  filters,
  pending,
  onCreate,
}: {
  filters: ReturnType<typeof toFilters>
  pending: boolean
  onCreate: (title: string) => void
}) {
  const q = filters.q?.trim()
  const narrowing = [
    q,
    filters.status && filters.status.length > 0,
    filters.due,
    filters.list,
  ].filter(Boolean).length

  return (
    <div className={styles.empty}>
      <p className={styles.emptyTitle}>
        {q ? `No tasks match “${q}”` : 'No tasks match'}
      </p>
      <p className={styles.emptyBody}>
        {narrowing >= 2
          ? `${count(narrowing)} filters are narrowing this search. Widening the status filter usually helps more than rewording.`
          : 'Try a different word, or clear the filters.'}
      </p>
      <div className={styles.emptyActions}>
        <Link to="/" search={{}} className={styles.link}>
          Clear filters
        </Link>
        {q && (
          <Button
            variant="primary"
            size="small"
            loading={pending}
            onClick={() => onCreate(q)}
          >
            Create “{q}”
          </Button>
        )}
      </div>
    </div>
  )
}

/** "Two filters", as the design writes it, rather than "2 filters". */
function count(n: number): string {
  return ['No', 'One', 'Two', 'Three', 'Four'][n] ?? String(n)
}

function countCopy(visible: number, total: number, filtering: boolean): string {
  if (total === 0) return 'No tasks yet'
  const noun = (n: number) => (n === 1 ? 'task' : 'tasks')
  if (filtering) return `${visible} of ${total} ${noun(total)}`
  return `${total} ${noun(total)}`
}
