import {
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { createTodo, listTodos } from './task.server'
import type { Task } from './task.types'
import type { CreateTaskInput } from './task.schema'

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
