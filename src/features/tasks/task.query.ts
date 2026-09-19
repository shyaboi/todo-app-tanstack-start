import {
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import {
  createTodo,
  deleteTodo,
  listTodos,
  restoreTodo,
  updateTodo,
} from './task.server'
import {
  indexOfTask,
  insertTaskAt,
  patchTask,
  removeTask,
  replaceTask,
} from './task.cache'
import type { Task } from './task.types'
import type { CreateTaskInput } from './task.schema'
import type { TaskPatchInput } from './task.schema'

/* One cache contract for the whole app, rather than fetch calls scattered
   through components.

   The canonical query holds the UNFILTERED list. Search and status filters are
   derived at render from the URL (PLAN.md D4): keying the query by filters
   would discard and refetch the cache on every keystroke, and would recreate
   the two-sources-of-truth problem the architecture exists to avoid. */

export const tasksQueryKey = ['tasks'] as const

export const tasksQuery = queryOptions({
  queryKey: tasksQueryKey,
  queryFn: () => listTodos({ data: {} }),
})

/** Temporary ids are namespaced so they can never be mistaken for a real one. */
export const TEMP_PREFIX = 'tmp_'
export const isTempId = (id: string) => id.startsWith(TEMP_PREFIX)

export function useCreateTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateTaskInput) => createTodo({ data: input }),

    /* Optimistic, with the temp id handled deliberately -- which is the
       condition the system design places on optimistic creation (PLAN.md D3).
       The row appears the instant you press Enter; the real id is swapped in
       when the server answers. */
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: tasksQueryKey })
      const previous = queryClient.getQueryData<Task[]>(tasksQueryKey)

      const now = new Date().toISOString()
      const optimistic: Task = {
        id: `${TEMP_PREFIX}${now}`,
        title: input.title.trim(),
        notes: input.notes ?? null,
        status: input.status ?? 'todo',
        dueAt: input.dueAt ?? null,
        priority: input.priority ?? 'p2',
        listId: input.listId ?? null,
        createdAt: now,
        updatedAt: now,
      }

      queryClient.setQueryData<Task[]>(tasksQueryKey, (old) => [
        optimistic,
        ...(old ?? []),
      ])

      return { previous, tempId: optimistic.id }
    },

    // Roll back to the exact snapshot. Never leave optimistic state without
    // a rollback path (system design 7, Failure Check 2).
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(tasksQueryKey, context.previous)
      }
    },

    // Swap the temp row for the server's, in place, so the row does not jump.
    onSuccess: (created, _input, context) => {
      queryClient.setQueryData<Task[]>(tasksQueryKey, (old) =>
        (old ?? []).map((t) => (t.id === context?.tempId ? created : t)),
      )
    },

    // The database stays authoritative regardless of which path ran.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tasksQueryKey })
    },
  })
}

/* Scoped per task id. A mutationKey alone does NOT serialise anything in
   TanStack Query -- mutations run in parallel unless they share a scope. Two
   quick status changes on one row would then race, and whichever response
   landed last would win, so a todo -> doing -> done double click could settle
   on "doing". Scoping by task id queues them; different rows still run
   concurrently. This is Failure Check 6, and the design anticipates it in its
   own demo data ("Debounce rapid toggles on the same row"). */
export function useUpdateTask(taskId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    scope: { id: `task-${taskId}` },
    mutationFn: ({ id, patch }: { id: string; patch: TaskPatchInput }) =>
      updateTodo({ data: { id, patch } }),

    onMutate: async ({ id, patch }) => {
      // Stop an in-flight list refetch from landing on top of the optimistic
      // write and reverting it mid-flight.
      await queryClient.cancelQueries({ queryKey: tasksQueryKey })
      const previous = queryClient.getQueryData<Task[]>(tasksQueryKey)

      queryClient.setQueryData<Task[]>(tasksQueryKey, (old) =>
        patchTask(old ?? [], id, patch),
      )

      return { previous }
    },

    // Restore the exact snapshot. Not "undo the patch" -- the snapshot is the
    // only thing guaranteed to be what was there before.
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(tasksQueryKey, context.previous)
      }
    },

    // Reconcile with the server's version, which owns updatedAt.
    onSuccess: (updated) => {
      queryClient.setQueryData<Task[]>(tasksQueryKey, (old) =>
        replaceTask(old ?? [], updated),
      )
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tasksQueryKey })
    },
  })
}

/** Everything the undo toast needs to reverse a delete. */
export interface PendingUndo {
  undoToken: string
  task: Task
  index: number
}

/* Deliberately NOT scoped per task, and deliberately not owned by the row.
   The optimistic removal unmounts the row before the server answers, and a
   mutation callback belonging to an unmounted component never runs -- so the
   undo toast would never appear. The page outlives every row, so it owns this.

   That costs the per-task serialisation that updates get. It is safe here
   because delete is terminal: an update racing a delete resolves to NOT_FOUND
   from the server, which is Failure Check 6's own answer -- the database stays
   authoritative and the cache reconciles on settle. */
export function useDeleteTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteTodo({ data: { id } }),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: tasksQueryKey })
      const previous = queryClient.getQueryData<Task[]>(tasksQueryKey) ?? []

      /* The position is captured, not just the task. Restoring to the end of
         the list would silently reorder it on every undo, so an undo would
         not actually undo. */
      const index = indexOfTask(previous, id)
      const task = previous[index]

      queryClient.setQueryData<Task[]>(tasksQueryKey, removeTask(previous, id))

      return { previous, task, index }
    },

    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(tasksQueryKey, context.previous)
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tasksQueryKey })
    },
  })
}

/** Everything needed to put the row back exactly where it was. */
export interface RestoreArgs {
  undoToken: string
  task: Task
  index: number
}

export function useRestoreTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ undoToken }: RestoreArgs) =>
      restoreTodo({ data: { undoToken } }),

    // Put it back where it was, immediately -- an undo that takes a round trip
    // to appear does not feel like an undo.
    onMutate: async ({ task, index }: RestoreArgs) => {
      await queryClient.cancelQueries({ queryKey: tasksQueryKey })
      const previous = queryClient.getQueryData<Task[]>(tasksQueryKey) ?? []
      queryClient.setQueryData<Task[]>(
        tasksQueryKey,
        insertTaskAt(previous, task, index),
      )
      return { previous }
    },

    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(tasksQueryKey, context.previous)
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tasksQueryKey })
    },
  })
}
