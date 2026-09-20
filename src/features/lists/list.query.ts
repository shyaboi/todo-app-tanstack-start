import {
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { reportFailure } from '~/shared/lib/reportFailure'
import { tasksQueryKey } from '~/features/tasks/task.query'
import type { Task } from '~/features/tasks/task.types'
import { createList, deleteList, listLists, renameList } from './list.server'
import type { CreateListInput, RenameListInput } from './list.schema'
import type { List } from './list.types'

/* The second cached collection (PLAN.md 4.1): one canonical `['lists']`
   query, loaded by the shell alongside `['tasks']`, so the sidebar, the
   filters, the panel, the palette and the composer all read the same list of
   lists. Mutations are optimistic with the same snapshot-and-rollback
   contract as tasks, and report failures the same way. */

export const listsQueryKey = ['lists'] as const

export const listsQuery = queryOptions({
  queryKey: listsQueryKey,
  queryFn: () => listLists(),
})

/**
 * Creating a list is NOT optimistic, and deliberately so.
 *
 * A list's id is a foreign key: the composer's `#name`, the panel's select
 * and the filter chips all send it back to the server, which validates its
 * shape and its ownership. An optimistic `tmp_…` id in the cache is therefore
 * not a cosmetic placeholder -- it is an invalid reference waiting to be sent,
 * and it was: the second `#name` in a row resolved to the temporary list and
 * the write was rejected at validation.
 *
 * This is the system design's own default (§7: pending UI and server
 * reconciliation, "because the database owns the real ID"). Tasks are the
 * documented exception (D3) because nothing references a task by id; a list
 * is referenced by definition, so it waits the ~50ms for its real id.
 */
export function useCreateList() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (input: CreateListInput) => createList({ data: input }),
    onError: (error, input) => {
      // Nothing to roll back: nothing was written.
      reportFailure(error, () => mutation.mutate(input))
    },
    onSuccess: (created) => {
      queryClient.setQueryData<List[]>(listsQueryKey, (old) => [
        ...(old ?? []),
        created,
      ])
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: listsQueryKey })
    },
  })
  return mutation
}

export function useRenameList() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (input: RenameListInput) => renameList({ data: input }),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: listsQueryKey })
      const previous = queryClient.getQueryData<List[]>(listsQueryKey)
      queryClient.setQueryData<List[]>(listsQueryKey, (old) =>
        (old ?? []).map((l) =>
          l.id === input.id ? { ...l, name: input.name.trim() } : l,
        ),
      )
      return { previous }
    },
    onError: (error, input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(listsQueryKey, context.previous)
      }
      reportFailure(error, () => mutation.mutate(input))
    },
    onSuccess: (renamed) => {
      queryClient.setQueryData<List[]>(listsQueryKey, (old) =>
        (old ?? []).map((l) => (l.id === renamed.id ? renamed : l)),
      )
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: listsQueryKey })
    },
  })
  return mutation
}

/* Deleting a list unassigns its tasks; it never deletes them. Both caches
   move together, optimistically, and both roll back together. */
export function useDeleteList() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (id: string) => deleteList({ data: { id } }),
    onMutate: async (id) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: listsQueryKey }),
        queryClient.cancelQueries({ queryKey: tasksQueryKey }),
      ])
      const previousLists = queryClient.getQueryData<List[]>(listsQueryKey)
      const previousTasks = queryClient.getQueryData<Task[]>(tasksQueryKey)
      queryClient.setQueryData<List[]>(listsQueryKey, (old) =>
        (old ?? []).filter((l) => l.id !== id),
      )
      queryClient.setQueryData<Task[]>(tasksQueryKey, (old) =>
        (old ?? []).map((t) => (t.listId === id ? { ...t, listId: null } : t)),
      )
      return { previousLists, previousTasks }
    },
    onError: (error, _id, context) => {
      if (context?.previousLists) {
        queryClient.setQueryData(listsQueryKey, context.previousLists)
      }
      if (context?.previousTasks) {
        queryClient.setQueryData(tasksQueryKey, context.previousTasks)
      }
      // No Retry: the row is back; delete it again from where it is.
      reportFailure(error)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: listsQueryKey })
      void queryClient.invalidateQueries({ queryKey: tasksQueryKey })
    },
  })
  return mutation
}
